/**
 * NexusOS Sync Engine
 * ====================
 * Real-time cross-device file synchronization with:
 * - File system watching (chokidar)
 * - Hash-based delta detection (xxhash)
 * - Chunked file transfer for large files
 * - Conflict resolution (last-write-wins + conflict copies)
 * - Virtual filesystem mapping (Desktop, Documents, etc.)
 */

import { watch } from 'chokidar';
import { createHash } from 'node:crypto';
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  statSync, readdirSync, unlinkSync, renameSync
} from 'node:fs';
import { readFile, writeFile, stat, readdir, mkdir, unlink, rename, cp } from 'node:fs/promises';
import path from 'node:path';
import { homedir, platform, hostname } from 'node:os';

const CHUNK_SIZE = 256 * 1024; // 256KB chunks for transfer
const IGNORE_PATTERNS = [
  /(^|[\/\\])\../, // ignore dotfiles
  /node_modules/,
  /dist/,
  /build/,
  /\.git/
];

// Virtual folders that get synced across devices
const SYNC_FOLDERS = {
  'Desktop': path.join(homedir(), 'Desktop'),
  'Documents': path.join(homedir(), 'Documents'),
  'Downloads': path.join(homedir(), 'Downloads'),
  'Pictures': path.join(homedir(), 'Pictures'),
  'Music': path.join(homedir(), 'Music'),
  'Videos': path.join(homedir(), 'Videos'),
};

const SYNC_META_DIR = path.join(homedir(), '.nexus-sync');
const SYNC_DB_FILE = path.join(SYNC_META_DIR, 'sync-state.json');
const CONFLICT_DIR = path.join(SYNC_META_DIR, 'conflicts');

export class SyncEngine {
  constructor(opts = {}) {
    this.deviceId = opts.deviceId || `device_${Math.random().toString(36).substring(2, 8)}`;
    this.deviceName = opts.deviceName || `${process.env.USER || 'User'}'s ${platform() === 'darwin' ? 'Mac' : 'PC'}`;
    this.account = opts.account || 'default';
    this.syncFolders = { ...SYNC_FOLDERS, ...(opts.extraFolders || {}) };
    this.watchers = new Map();
    this.fileIndex = new Map(); // relativePath -> { hash, size, mtime, deviceId }
    this.pendingSync = new Map(); // relativePath -> timeout
    this.listeners = new Set(); // event listeners
    this.paused = false;
    this.syncStats = { filesWatched: 0, synced: 0, conflicts: 0, errors: 0, lastSync: null };

    // Ensure meta directories exist
    if (!existsSync(SYNC_META_DIR)) mkdirSync(SYNC_META_DIR, { recursive: true });
    if (!existsSync(CONFLICT_DIR)) mkdirSync(CONFLICT_DIR, { recursive: true });

    // Load persisted sync state
    this._loadSyncState();
  }

  // ─── Event System ─────────────────────────────────────────

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(event, data) {
    for (const fn of this.listeners) {
      try { fn(event, data); } catch (e) { console.error('[SyncEngine] listener error:', e); }
    }
  }

  // ─── Sync State Persistence ───────────────────────────────

  _loadSyncState() {
    try {
      if (existsSync(SYNC_DB_FILE)) {
        const data = JSON.parse(readFileSync(SYNC_DB_FILE, 'utf8'));
        if (data.fileIndex) {
          for (const [k, v] of Object.entries(data.fileIndex)) {
            this.fileIndex.set(k, v);
          }
        }
        if (data.syncStats) this.syncStats = { ...this.syncStats, ...data.syncStats };
        if (data.deviceId) this.deviceId = data.deviceId;
      }
    } catch (e) {
      console.warn('[SyncEngine] Could not load sync state:', e.message);
    }
  }

  _saveSyncState() {
    try {
      const data = {
        deviceId: this.deviceId,
        syncStats: this.syncStats,
        fileIndex: Object.fromEntries(this.fileIndex),
        savedAt: Date.now()
      };
      writeFileSync(SYNC_DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[SyncEngine] Could not save sync state:', e.message);
    }
  }

  // ─── File Hashing ─────────────────────────────────────────

  _hashFile(filePath) {
    try {
      const content = readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  }

  _hashContent(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  // ─── Path Resolution ──────────────────────────────────────

  /**
   * Convert absolute path -> virtual relative path (e.g. "Desktop/myfile.txt")
   */
  toVirtualPath(absolutePath) {
    const resolved = path.resolve(absolutePath);
    for (const [folder, base] of Object.entries(this.syncFolders)) {
      const resolvedBase = path.resolve(base);
      if (resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase) {
        return path.join(folder, path.relative(resolvedBase, resolved));
      }
    }
    return null; // Not in a synced folder
  }

  /**
   * Convert virtual path -> absolute path on this device
   */
  toAbsolutePath(virtualPath) {
    const parts = virtualPath.split(path.sep);
    const folder = parts[0];
    if (this.syncFolders[folder]) {
      return path.join(this.syncFolders[folder], ...parts.slice(1));
    }
    return null;
  }

  // ─── File Watching ────────────────────────────────────────

  startWatching() {
    console.log(`[SyncEngine] Starting file watchers for ${Object.keys(this.syncFolders).length} folders...`);

    for (const [name, folderPath] of Object.entries(this.syncFolders)) {
      if (!existsSync(folderPath)) {
        console.warn(`[SyncEngine] Folder not found, creating: ${folderPath}`);
        mkdirSync(folderPath, { recursive: true });
      }

      const watcher = watch(folderPath, {
        ignored: IGNORE_PATTERNS,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
        depth: 3,
      });

      watcher
        .on('add', (fp) => this._onFileChange('add', fp, name))
        .on('change', (fp) => this._onFileChange('change', fp, name))
        .on('unlink', (fp) => this._onFileChange('unlink', fp, name))
        .on('addDir', (fp) => this._onFileChange('addDir', fp, name))
        .on('unlinkDir', (fp) => this._onFileChange('unlinkDir', fp, name))
        .on('error', (err) => console.error(`[SyncEngine] Watcher error for ${name}:`, err));

      this.watchers.set(name, watcher);
      console.log(`[SyncEngine] 👁️  Watching: ${name} -> ${folderPath}`);
    }

    this._emit('watching_started', { folders: Object.keys(this.syncFolders) });
  }

  stopWatching() {
    for (const [name, watcher] of this.watchers) {
      watcher.close();
      console.log(`[SyncEngine] Stopped watching: ${name}`);
    }
    this.watchers.clear();
    this._saveSyncState();
  }

  _onFileChange(event, filePath, folderName) {
    if (this.paused) return;

    const virtualPath = this.toVirtualPath(filePath);
    if (!virtualPath) return;

    // Debounce rapid changes (300ms)
    const key = virtualPath;
    if (this.pendingSync.has(key)) clearTimeout(this.pendingSync.get(key));

    this.pendingSync.set(key, setTimeout(() => {
      this.pendingSync.delete(key);
      this._processFileEvent(event, filePath, virtualPath);
    }, 300));
  }

  async _processFileEvent(event, absolutePath, virtualPath) {
    try {
      let entry;

      if (event === 'unlink' || event === 'unlinkDir') {
        entry = { virtualPath, event: 'delete', deviceId: this.deviceId, timestamp: Date.now() };
        this.fileIndex.delete(virtualPath);
      } else {
        const stats = await stat(absolutePath);
        const hash = stats.isFile() ? this._hashFile(absolutePath) : null;

        // Check if actually changed
        const existing = this.fileIndex.get(virtualPath);
        if (existing && existing.hash === hash && existing.size === stats.size) return;

        entry = {
          virtualPath,
          event: event === 'addDir' ? 'mkdir' : (event === 'add' ? 'create' : 'modify'),
          hash,
          size: stats.size,
          mtime: stats.mtimeMs,
          isDir: stats.isDirectory(),
          deviceId: this.deviceId,
          timestamp: Date.now(),
        };

        this.fileIndex.set(virtualPath, entry);
      }

      this.syncStats.filesWatched = this.fileIndex.size;
      this._emit('file_changed', entry);
      this._saveSyncState();

    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[SyncEngine] Error processing ${event} for ${virtualPath}:`, err.message);
        this.syncStats.errors++;
      }
    }
  }

  // ─── File Operations for Sync ─────────────────────────────

  /**
   * Read a file and return it as base64 chunks for transfer
   */
  async readFileForSync(virtualPath) {
    const absPath = this.toAbsolutePath(virtualPath);
    if (!absPath || !existsSync(absPath)) throw new Error(`File not found: ${virtualPath}`);

    const stats = statSync(absPath);
    if (stats.isDirectory()) {
      const entries = readdirSync(absPath, { withFileTypes: true });
      return {
        type: 'directory',
        virtualPath,
        entries: entries.map(e => ({
          name: e.name,
          isDir: e.isDirectory(),
          virtualPath: path.join(virtualPath, e.name),
        }))
      };
    }

    const content = await readFile(absPath);
    const hash = this._hashContent(content);

    // For files under 1MB, send whole. Else chunk.
    if (content.length <= 1024 * 1024) {
      return {
        type: 'file',
        virtualPath,
        hash,
        size: content.length,
        mtime: stats.mtimeMs,
        encoding: 'base64',
        data: content.toString('base64'),
        chunked: false,
      };
    }

    // Chunked transfer
    const chunks = [];
    for (let i = 0; i < content.length; i += CHUNK_SIZE) {
      chunks.push({
        index: chunks.length,
        data: content.subarray(i, i + CHUNK_SIZE).toString('base64'),
      });
    }

    return {
      type: 'file',
      virtualPath,
      hash,
      size: content.length,
      mtime: stats.mtimeMs,
      encoding: 'base64',
      chunked: true,
      totalChunks: chunks.length,
      chunks,
    };
  }

  /**
   * Write a synced file to this device
   */
  async writeFileFromSync(syncData) {
    const absPath = this.toAbsolutePath(syncData.virtualPath);
    if (!absPath) throw new Error(`Invalid virtual path: ${syncData.virtualPath}`);

    // Conflict detection
    const existing = this.fileIndex.get(syncData.virtualPath);
    if (existing && existing.hash && syncData.hash && existing.hash !== syncData.hash) {
      // Both modified — check timestamps
      if (existing.timestamp && syncData.timestamp && Math.abs(existing.timestamp - syncData.timestamp) < 2000) {
        // Conflict! Save conflict copy
        await this._saveConflictCopy(absPath, syncData.virtualPath, syncData.deviceId);
        this.syncStats.conflicts++;
        this._emit('conflict', { virtualPath: syncData.virtualPath, deviceId: syncData.deviceId });
      }
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(absPath);
    if (!existsSync(parentDir)) await mkdir(parentDir, { recursive: true });

    if (syncData.type === 'directory' || syncData.isDir) {
      if (!existsSync(absPath)) await mkdir(absPath, { recursive: true });
    } else {
      let content;
      if (syncData.chunked) {
        const buffers = syncData.chunks
          .sort((a, b) => a.index - b.index)
          .map(c => Buffer.from(c.data, 'base64'));
        content = Buffer.concat(buffers);
      } else {
        content = Buffer.from(syncData.data, 'base64');
      }

      // Verify hash
      const receivedHash = this._hashContent(content);
      if (syncData.hash && receivedHash !== syncData.hash) {
        throw new Error(`Hash mismatch for ${syncData.virtualPath}: expected ${syncData.hash}, got ${receivedHash}`);
      }

      // Pause watcher to avoid echo
      this.paused = true;
      await writeFile(absPath, content);
      this.paused = false;

      // Update index
      const stats = await stat(absPath);
      this.fileIndex.set(syncData.virtualPath, {
        hash: receivedHash,
        size: stats.size,
        mtime: stats.mtimeMs,
        deviceId: syncData.deviceId || this.deviceId,
        timestamp: Date.now(),
      });
    }

    this.syncStats.synced++;
    this.syncStats.lastSync = Date.now();
    this._saveSyncState();
    this._emit('file_synced', { virtualPath: syncData.virtualPath });
  }

  /**
   * Delete a file from this device (triggered by remote delete)
   */
  async deleteFileFromSync(virtualPath) {
    const absPath = this.toAbsolutePath(virtualPath);
    if (!absPath || !existsSync(absPath)) return;

    this.paused = true;
    try {
      const stats = statSync(absPath);
      if (stats.isDirectory()) {
        // Recursively delete empty dirs only
        const entries = readdirSync(absPath);
        if (entries.length === 0) {
          await unlink(absPath).catch(() => {});
        }
      } else {
        // Move to conflict/trash instead of hard delete
        const trashPath = path.join(CONFLICT_DIR, `deleted_${Date.now()}_${path.basename(absPath)}`);
        await rename(absPath, trashPath);
      }
      this.fileIndex.delete(virtualPath);
      this._emit('file_deleted', { virtualPath });
    } finally {
      this.paused = false;
    }
  }

  async _saveConflictCopy(absPath, virtualPath, sourceDeviceId) {
    if (!existsSync(absPath)) return;
    const ext = path.extname(absPath);
    const base = path.basename(absPath, ext);
    const conflictName = `${base}_conflict_${sourceDeviceId}_${Date.now()}${ext}`;
    const conflictPath = path.join(CONFLICT_DIR, conflictName);
    try {
      await cp(absPath, conflictPath);
      console.log(`[SyncEngine] Conflict copy saved: ${conflictPath}`);
    } catch (e) {
      console.error('[SyncEngine] Failed to save conflict copy:', e.message);
    }
  }

  // ─── Full Sync / Index ────────────────────────────────────

  /**
   * Build a complete file index of all watched folders
   */
  async buildFullIndex() {
    const index = {};
    for (const [folderName, folderPath] of Object.entries(this.syncFolders)) {
      if (!existsSync(folderPath)) continue;
      await this._indexDir(folderPath, folderName, index);
    }
    return index;
  }

  async _indexDir(dirPath, virtualBase, index, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        // Skip ignored patterns
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;

        const absPath = path.join(dirPath, entry.name);
        const virtualPath = path.join(virtualBase, entry.name);

        if (entry.isDirectory()) {
          index[virtualPath] = { isDir: true, virtualPath };
          await this._indexDir(absPath, virtualPath, index, depth + 1);
        } else {
          try {
            const stats = await stat(absPath);
            index[virtualPath] = {
              virtualPath,
              isDir: false,
              size: stats.size,
              mtime: stats.mtimeMs,
              hash: stats.size < 10 * 1024 * 1024 ? this._hashFile(absPath) : null, // Only hash < 10MB
            };
          } catch {}
        }
      }
    } catch {}
  }

  /**
   * Get all sync folders with their status
   */
  getSyncStatus() {
    const folders = {};
    for (const [name, fp] of Object.entries(this.syncFolders)) {
      try {
        const entries = existsSync(fp) ? readdirSync(fp).length : 0;
        folders[name] = { path: fp, exists: existsSync(fp), entries, watching: this.watchers.has(name) };
      } catch {
        folders[name] = { path: fp, exists: false, entries: 0, watching: false };
      }
    }
    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      account: this.account,
      platform: platform(),
      hostname: hostname(),
      folders,
      stats: this.syncStats,
      fileIndex: this.fileIndex.size,
    };
  }

  /**
   * Browse a virtual path — returns directory listing from this device
   */
  async browse(virtualPath = '') {
    if (!virtualPath || virtualPath === '/' || virtualPath === '') {
      // Root — show all sync folders
      return {
        virtualPath: '/',
        isRoot: true,
        entries: Object.entries(this.syncFolders).map(([name, fp]) => ({
          name,
          virtualPath: name,
          isDir: true,
          exists: existsSync(fp),
          icon: this._folderIcon(name),
        }))
      };
    }

    const absPath = this.toAbsolutePath(virtualPath);
    if (!absPath || !existsSync(absPath)) {
      throw new Error(`Path not found: ${virtualPath}`);
    }

    const stats = statSync(absPath);
    if (!stats.isDirectory()) {
      // Return file info
      return {
        virtualPath,
        isDir: false,
        size: stats.size,
        mtime: stats.mtimeMs,
        name: path.basename(absPath),
      };
    }

    const entries = await readdir(absPath, { withFileTypes: true });
    return {
      virtualPath,
      isDir: true,
      entries: entries
        .filter(e => !e.name.startsWith('.'))
        .slice(0, 500)
        .map(e => {
          const childVirtual = path.join(virtualPath, e.name);
          const childAbs = path.join(absPath, e.name);
          let size = 0;
          let mtime = 0;
          try {
            const s = statSync(childAbs);
            size = s.size;
            mtime = s.mtimeMs;
          } catch {}
          return {
            name: e.name,
            virtualPath: childVirtual,
            isDir: e.isDirectory(),
            size,
            mtime,
          };
        })
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    };
  }

  _folderIcon(name) {
    const icons = { Desktop: '🖥️', Documents: '📄', Downloads: '⬇️', Pictures: '🖼️', Music: '🎵', Videos: '🎬' };
    return icons[name] || '📁';
  }
}
