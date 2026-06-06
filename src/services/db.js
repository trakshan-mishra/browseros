/**
 * NexusOS — Dexie (IndexedDB) Database Service
 *
 * DROP THIS IN: src/services/db.js
 *
 * Install first:
 *   npm install dexie
 *
 * Then import anywhere:
 *   import db from '../services/db';
 *   await db.notes.add({ title: 'Hello', content: '...', pinned: false, updatedAt: Date.now() });
 */

import Dexie from 'dexie';

const db = new Dexie('NexusOS');

db.version(1).stores({
  // Virtual filesystem nodes
  fsNodes: '++id, parentId, name, type, updatedAt, deletedAt',

  // Notes app
  notes: '++id, title, pinned, updatedAt, deletedAt, *tags',

  // Kanban tasks
  tasks: '++id, column, priority, dueDate, projectId, createdAt, updatedAt',

  // Calendar events
  events: '++id, title, start, end, allDay, color',

  // Focus timer sessions
  sessions: '++id, type, task, startedAt, endedAt',

  // AI agent memory (persistent between chats)
  agentMemory: '++id, type, key, value, updatedAt',

  // Sync op-log
  opLog: '++seq, nodeId, deviceId, operation, appliedAt, syncedTo',

  // App settings / preferences
  settings: 'key',

  // Dock pinned apps
  dockItems: '++id, appId, order',
});

// ─── Notes helpers ────────────────────────────────────────────────────────

export const notesDB = {
  getAll: () => db.notes.where('deletedAt').equals(0).or('deletedAt').equals(undefined).toArray()
    .catch(() => db.notes.toArray()),

  create: (title = 'Untitled', content = '') =>
    db.notes.add({ title, content, pinned: false, tags: [], updatedAt: Date.now(), deletedAt: 0 }),

  update: (id, changes) =>
    db.notes.update(id, { ...changes, updatedAt: Date.now() }),

  delete: (id) =>
    db.notes.update(id, { deletedAt: Date.now() }),

  search: (query) =>
    db.notes.filter(n => !n.deletedAt &&
      (n.title.toLowerCase().includes(query.toLowerCase()) ||
       (n.content || '').toLowerCase().includes(query.toLowerCase()))
    ).toArray(),
};

// ─── Tasks helpers ────────────────────────────────────────────────────────

export const tasksDB = {
  getAll: () => db.tasks.toArray(),

  getByColumn: (column) => db.tasks.where('column').equals(column).toArray(),

  create: (title, column = 'Backlog', opts = {}) =>
    db.tasks.add({
      title, column,
      priority: opts.priority || 'medium',
      dueDate: opts.dueDate || null,
      projectId: opts.projectId || null,
      tags: opts.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),

  update: (id, changes) =>
    db.tasks.update(id, { ...changes, updatedAt: Date.now() }),

  move: (id, column) =>
    db.tasks.update(id, { column, updatedAt: Date.now() }),

  delete: (id) => db.tasks.delete(id),
};

// ─── Sessions helpers ─────────────────────────────────────────────────────

export const sessionsDB = {
  add: (type, task, duration) =>
    db.sessions.add({ type, task, startedAt: Date.now(), endedAt: null, duration }),

  complete: (id) =>
    db.sessions.update(id, { endedAt: Date.now() }),

  getTodaySessions: () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return db.sessions.where('startedAt').above(+start).toArray();
  },

  getRecent: (limit = 20) =>
    db.sessions.orderBy('startedAt').reverse().limit(limit).toArray(),
};

// ─── Events helpers ───────────────────────────────────────────────────────

export const eventsDB = {
  getInRange: (start, end) =>
    db.events.where('start').between(+start, +end, true, true).toArray(),

  create: (title, start, end, allDay = false, color = '#007AFF') =>
    db.events.add({ title, start: +start, end: +end, allDay, color }),

  update: (id, changes) => db.events.update(id, changes),

  delete: (id) => db.events.delete(id),
};

// ─── Agent memory helpers ─────────────────────────────────────────────────

export const memoryDB = {
  getAll: () => db.agentMemory.toArray(),

  upsert: async (type, key, value) => {
    const existing = await db.agentMemory
      .where('[type+key]').equals([type, key]).first()
      .catch(() => db.agentMemory.filter(m => m.type === type && m.key === key).first());
    if (existing) {
      return db.agentMemory.update(existing.id, { value, updatedAt: Date.now() });
    }
    return db.agentMemory.add({ type, key, value, updatedAt: Date.now() });
  },

  buildSystemContext: async () => {
    const memories = await db.agentMemory.toArray();
    if (!memories.length) return '';
    return '\n\nUser context:\n' +
      memories.map(m => `- [${m.type}] ${m.key}: ${JSON.stringify(m.value)}`).join('\n');
  },
};

// ─── Settings helpers ─────────────────────────────────────────────────────

export const settingsDB = {
  get: (key, fallback = null) =>
    db.settings.get(key).then(r => r?.value ?? fallback).catch(() => fallback),

  set: (key, value) =>
    db.settings.put({ key, value }),

  getAll: () =>
    db.settings.toArray().then(rows =>
      Object.fromEntries(rows.map(r => [r.key, r.value]))
    ),
};

export default db;