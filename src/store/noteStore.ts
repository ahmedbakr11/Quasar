import { create } from "zustand";
import {
  createNote as createNoteApi,
  deleteNote as deleteNoteApi,
  listNotes,
  updateNote as updateNoteApi,
  type Note
} from "@/lib/tauriCommands";

type CreateNoteInput = {
  title: string;
  body: string;
  labels: string[];
  colorToken: string;
  pinned: boolean;
};

type NoteState = {
  notes: Note[];
  isLoading: boolean;
  loadNotes: (sessionToken: string) => Promise<void>;
  createNote: (sessionToken: string, input: CreateNoteInput) => Promise<void>;
  updateNote: (
    sessionToken: string,
    noteId: string,
    patch: Partial<Pick<Note, "title" | "body" | "labels" | "colorToken" | "pinned" | "archived">>
  ) => Promise<void>;
  deleteNote: (sessionToken: string, noteId: string) => Promise<void>;
};

const replaceNote = (notes: Note[], next: Note): Note[] => {
  const exists = notes.some((note) => note.id === next.id);
  const updated = exists ? notes.map((note) => (note.id === next.id ? next : note)) : [next, ...notes];
  return updated.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  isLoading: false,
  loadNotes: async (sessionToken) => {
    set({ isLoading: true });
    try {
      const notes = await listNotes(sessionToken);
      set({ notes });
    } finally {
      set({ isLoading: false });
    }
  },
  createNote: async (sessionToken, input) => {
    const created = await createNoteApi(sessionToken, input);
    set((state) => ({ notes: replaceNote(state.notes, created) }));
  },
  updateNote: async (sessionToken, noteId, patch) => {
    const updated = await updateNoteApi(sessionToken, noteId, patch);
    set((state) => ({
      notes: updated.archived ? state.notes.filter((note) => note.id !== noteId) : replaceNote(state.notes, updated)
    }));
  },
  deleteNote: async (sessionToken, noteId) => {
    await deleteNoteApi(sessionToken, noteId);
    set((state) => ({ notes: state.notes.filter((note) => note.id !== noteId) }));
  }
}));

export type { Note };
