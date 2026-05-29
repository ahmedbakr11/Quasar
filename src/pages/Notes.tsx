import { Archive, Palette, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type Note, useNoteStore } from "@/store/noteStore";
import { useAuthStore } from "@/store/authStore";

const noteColors = [
  { token: "slate", label: "Slate", className: "border-white/10 bg-[#171717]" },
  { token: "sky", label: "Sky", className: "border-sky-400/30 bg-sky-950/40" },
  { token: "emerald", label: "Emerald", className: "border-emerald-400/30 bg-emerald-950/35" },
  { token: "amber", label: "Amber", className: "border-amber-400/30 bg-amber-950/35" },
  { token: "rose", label: "Rose", className: "border-rose-400/30 bg-rose-950/35" }
] as const;

const defaultDraft = {
  title: "",
  body: "",
  labelsText: "",
  colorToken: "slate",
  pinned: false
};

const getNoteColor = (token: string) => noteColors.find((item) => item.token === token) ?? noteColors[0];

const parseLabels = (value: string) =>
  value
    .split(",")
    .map((label) => label.trim().replace(/^#/, ""))
    .filter(Boolean);

export default function Notes() {
  const user = useAuthStore((state) => state.user);
  const sessionToken = useAuthStore((state) => state.sessionToken);
  const { notes, isLoading, loadNotes, createNote, updateNote, deleteNote } = useNoteStore();
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(defaultDraft);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    void loadNotes(sessionToken).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to load notes");
    });
  }, [loadNotes, sessionToken]);

  const filteredNotes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return notes;
    return notes.filter((note) => {
      const haystack = [note.title, note.body, ...note.labels].join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }, [notes, query]);

  const pinnedNotes = filteredNotes.filter((note) => note.pinned);
  const otherNotes = filteredNotes.filter((note) => !note.pinned);

  if (!user) return <Navigate to="/login" replace />;
  if (!sessionToken) return <Navigate to="/login" replace />;

  const resetDraft = () => {
    setDraft(defaultDraft);
    setComposerOpen(false);
  };

  const submitNote = async () => {
    if (!draft.title.trim() && !draft.body.trim()) return;
    try {
      await createNote(sessionToken, {
        title: draft.title,
        body: draft.body,
        labels: parseLabels(draft.labelsText),
        colorToken: draft.colorToken,
        pinned: draft.pinned
      });
      resetDraft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create note");
    }
  };

  const saveEditingNote = async () => {
    if (!editingNote) return;
    try {
      await updateNote(sessionToken, editingNote.id, {
        title: editingNote.title,
        body: editingNote.body,
        labels: editingNote.labels,
        colorToken: editingNote.colorToken,
        pinned: editingNote.pinned
      });
      setEditingNote(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update note");
    }
  };

  const renderSection = (title: string, sectionNotes: Note[]) => {
    if (sectionNotes.length === 0) return null;
    return (
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{title}</h2>
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
          {sectionNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => setEditingNote(note)}
              onTogglePin={() =>
                void updateNote(sessionToken, note.id, { pinned: !note.pinned }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to pin note");
                })
              }
              onArchive={() =>
                void updateNote(sessionToken, note.id, { archived: true }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to archive note");
                })
              }
              onDelete={() =>
                void deleteNote(sessionToken, note.id).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to delete note");
                })
              }
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-[calc(100vh-40px)] bg-background pb-28">
      <main className="mx-auto max-w-7xl p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Notes</h1>
            <p className="mt-2 text-sm text-muted">Capture ideas, lists, and Luna-ready context.</p>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search notes" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>

        <section className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-3 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
          {composerOpen ? (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Title"
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              />
              <textarea
                className="min-h-28 w-full resize-none rounded-md border border-border bg-surfaceAlt p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="Take a note..."
                value={draft.body}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
              />
              <Input
                placeholder="Labels separated by commas"
                value={draft.labelsText}
                onChange={(event) => setDraft((prev) => ({ ...prev, labelsText: event.target.value }))}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    className={cn("rounded-md p-2 text-muted hover:bg-surfaceAlt hover:text-text", draft.pinned && "bg-surfaceAlt text-primary")}
                    onClick={() => setDraft((prev) => ({ ...prev, pinned: !prev.pinned }))}
                    title="Pin note"
                    type="button"
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                  <ColorPicker value={draft.colorToken} onChange={(colorToken) => setDraft((prev) => ({ ...prev, colorToken }))} />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={resetDraft}>Close</Button>
                  <Button onClick={() => void submitNote()} disabled={!draft.title.trim() && !draft.body.trim()}>
                    Add Note
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surfaceAlt" onClick={() => setComposerOpen(true)}>
              <Plus className="h-4 w-4" />
              Take a note...
            </button>
          )}
        </section>

        {renderSection("Pinned", pinnedNotes)}
        {renderSection(pinnedNotes.length ? "Others" : "Notes", otherNotes)}

        {!isLoading && filteredNotes.length === 0 && (
          <div className="mt-16 text-center text-sm text-muted">
            {query.trim() ? "No notes match your search." : "No notes yet. Capture the first one above."}
          </div>
        )}
        {isLoading && <div className="mt-8 text-center text-sm text-muted">Loading notes...</div>}
      </main>

      {editingNote && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className={cn("w-full max-w-2xl rounded-xl border p-5", getNoteColor(editingNote.colorToken).className)}>
            <div className="mb-3 flex items-center justify-between">
              <button
                className="rounded-md p-2 text-muted hover:bg-white/10 hover:text-text"
                onClick={() => setEditingNote((prev) => (prev ? { ...prev, pinned: !prev.pinned } : prev))}
                title={editingNote.pinned ? "Unpin note" : "Pin note"}
              >
                {editingNote.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </button>
              <button className="rounded-md p-2 text-muted hover:bg-white/10 hover:text-text" onClick={() => setEditingNote(null)} title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              className="mb-3 border-white/10 bg-black/15 text-lg font-semibold"
              placeholder="Title"
              value={editingNote.title}
              onChange={(event) => setEditingNote((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
            />
            <textarea
              className="min-h-56 w-full resize-none rounded-md border border-white/10 bg-black/15 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Note"
              value={editingNote.body}
              onChange={(event) => setEditingNote((prev) => (prev ? { ...prev, body: event.target.value } : prev))}
            />
            <Input
              className="mt-3 border-white/10 bg-black/15"
              placeholder="Labels separated by commas"
              value={editingNote.labels.join(", ")}
              onChange={(event) => setEditingNote((prev) => (prev ? { ...prev, labels: parseLabels(event.target.value) } : prev))}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <ColorPicker value={editingNote.colorToken} onChange={(colorToken) => setEditingNote((prev) => (prev ? { ...prev, colorToken } : prev))} />
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setEditingNote(null)}>Cancel</Button>
                <Button onClick={() => void saveEditingNote()}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Palette className="mr-1 h-4 w-4 text-muted" />
      {noteColors.map((color) => (
        <button
          key={color.token}
          className={cn("h-6 w-6 rounded-full border", color.className, value === color.token && "ring-2 ring-primary")}
          onClick={() => onChange(color.token)}
          title={color.label}
          type="button"
        />
      ))}
    </div>
  );
}

function NoteCard({
  note,
  onEdit,
  onTogglePin,
  onArchive,
  onDelete
}: {
  note: Note;
  onEdit: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={cn("mb-4 break-inside-avoid rounded-xl border p-4 transition hover:border-white/25", getNoteColor(note.colorToken).className)}>
      <button className="w-full text-left" onClick={onEdit}>
        {note.title && <h3 className="mb-2 text-base font-semibold">{note.title}</h3>}
        {note.body && <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{note.body}</p>}
      </button>
      {note.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {note.labels.map((label) => (
            <span key={label} className="rounded-full bg-black/20 px-2 py-0.5 text-xs text-zinc-300">
              #{label}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-muted">
        <button className="rounded-md p-1.5 hover:bg-white/10 hover:text-text" onClick={onTogglePin} title={note.pinned ? "Unpin note" : "Pin note"}>
          {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-1">
          <button className="rounded-md p-1.5 hover:bg-white/10 hover:text-text" onClick={onArchive} title="Archive note">
            <Archive className="h-4 w-4" />
          </button>
          <button className="rounded-md p-1.5 hover:bg-white/10 hover:text-destructive" onClick={onDelete} title="Delete note">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
