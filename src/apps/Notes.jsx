import { useState, useEffect } from 'react';
import './Notes.css';

export default function NotesApp() {
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('nexusos-notes');
    return saved ? JSON.parse(saved) : [
      { id: 1, title: 'Welcome to NexusOS', content: 'This is your personal notes app. Start typing to create a new note!', date: Date.now() },
      { id: 2, title: 'AI Features', content: 'Configure your API keys in Settings to unlock AI-powered features:\n\n• Smart text completion\n• Summarization\n• Translation\n• Code generation', date: Date.now() - 86400000 },
    ];
  });
  const [activeId, setActiveId] = useState(notes[0]?.id || null);

  useEffect(() => {
    localStorage.setItem('nexusos-notes', JSON.stringify(notes));
  }, [notes]);

  const activeNote = notes.find(n => n.id === activeId);

  const createNote = () => {
    const n = { id: Date.now(), title: 'Untitled Note', content: '', date: Date.now() };
    setNotes(prev => [n, ...prev]);
    setActiveId(n.id);
  };

  const updateNote = (field, value) => {
    setNotes(prev => prev.map(n => n.id === activeId ? { ...n, [field]: value, date: Date.now() } : n));
  };

  const deleteNote = (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeId === id) setActiveId(notes.find(n => n.id !== id)?.id || null);
  };

  return (
    <div className="notes-app">
      <div className="notes-sidebar">
        <div className="notes-sidebar-header">
          <span className="notes-count">{notes.length} Notes</span>
          <button className="notes-new-btn" onClick={createNote} title="New Note">+</button>
        </div>
        <div className="notes-list">
          {notes.map(note => (
            <div
              key={note.id}
              className={`notes-item ${note.id === activeId ? 'notes-item-active' : ''}`}
              onClick={() => setActiveId(note.id)}
            >
              <div className="notes-item-title">{note.title || 'Untitled'}</div>
              <div className="notes-item-preview">{note.content.slice(0, 60) || 'No content'}</div>
              <div className="notes-item-date">{new Date(note.date).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="notes-editor">
        {activeNote ? (
          <>
            <input
              className="notes-title-input"
              value={activeNote.title}
              onChange={e => updateNote('title', e.target.value)}
              placeholder="Note title..."
            />
            <textarea
              className="notes-content-input"
              value={activeNote.content}
              onChange={e => updateNote('content', e.target.value)}
              placeholder="Start typing..."
            />
            <button className="notes-delete-btn" onClick={() => deleteNote(activeNote.id)}>🗑️ Delete</button>
          </>
        ) : (
          <div className="notes-empty">Select or create a note</div>
        )}
      </div>
    </div>
  );
}
