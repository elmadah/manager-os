import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../lib/api';

const DEBOUNCE_MS = 1500;
const SAVED_DISPLAY_MS = 2000;

export default function useAutosave({ editingNote, content, contextDefaults = {} }) {
  const [saveStatus, setSaveStatus] = useState('idle');
  const [createdNote, setCreatedNote] = useState(null);

  const lastSavedContentRef = useRef(editingNote?.content || '');
  const timeoutRef = useRef(null);
  const savedDisplayRef = useRef(null);
  const isSavingRef = useRef(false);
  const contentRef = useRef(content);
  const noteRef = useRef(editingNote);
  const createdNoteRef = useRef(null);

  contentRef.current = content;
  noteRef.current = editingNote;

  // When editingNote changes (e.g. parent updates after createdNote), sync refs
  useEffect(() => {
    if (editingNote) {
      noteRef.current = editingNote;
      lastSavedContentRef.current = editingNote.content || '';
    }
  }, [editingNote]);

  const save = useCallback(async () => {
    const currentContent = contentRef.current;
    const note = noteRef.current || createdNoteRef.current;

    // Skip if content unchanged or empty
    const stripped = currentContent.replace(/<[^>]*>/g, '').trim();
    if (!stripped || currentContent === lastSavedContentRef.current) {
      return;
    }

    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveStatus('saving');

    try {
      if (note) {
        // Update existing note
        await api.put(`/notes/${note.id}`, { content: currentContent });
      } else {
        // Create new note with defaults
        const payload = {
          content: currentContent,
          category: contextDefaults.category || 'general',
          project_id: contextDefaults.projectId || null,
          feature_id: contextDefaults.featureId || null,
          team_member_id: contextDefaults.teamMemberId || null,
        };
        const created = await api.post('/notes', payload);
        createdNoteRef.current = created;
        setCreatedNote(created);
      }
      lastSavedContentRef.current = currentContent;
      setSaveStatus('saved');

      if (savedDisplayRef.current) clearTimeout(savedDisplayRef.current);
      savedDisplayRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_DISPLAY_MS);
    } catch (err) {
      console.error('Autosave failed:', err);
      setSaveStatus('idle');
    } finally {
      isSavingRef.current = false;
    }
  }, [contextDefaults.category, contextDefaults.projectId, contextDefaults.featureId, contextDefaults.teamMemberId]);

  // Debounce on content change
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      save();
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [content, save]);

  // Flush: immediately save pending changes
  const flushSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // Only flush if content has actually changed
    const currentContent = contentRef.current;
    const stripped = currentContent.replace(/<[^>]*>/g, '').trim();
    if (stripped && currentContent !== lastSavedContentRef.current) {
      save();
    }
  }, [save]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (savedDisplayRef.current) clearTimeout(savedDisplayRef.current);
    };
  }, []);

  return { saveStatus, createdNote, flushSave };
}
