import json
import os
import tempfile
import re

from livekit.agents import Agent, ChatContext, ChatMessage

MEMORY_SUMMARY_PREFIX = "Persistent memory summary from previous sessions:"
PERSISTENT_MEMORY_PREFIX = "Persistent core memory (agent-defining facts):"
MEMORY_POLICY = (
    "You have persistent memory from previous sessions in this context. "
    "Use it when relevant, and do not claim you cannot remember past sessions "
    "unless the memory is actually missing or ambiguous."
)

_ASSISTANT_MEMORY_DENIAL_RE = re.compile(
    r"\b(i do not|i don't|i cant|i can't)\b.{0,80}\b(remember|recall|retain|context|previous|past|session)\b",
    re.IGNORECASE | re.DOTALL,
)


def resolve_memory_path(memory_file: str) -> str:
    expanded = os.path.expanduser(memory_file)
    if os.path.isabs(expanded):
        return os.path.abspath(expanded)
    # Quasar launches packaged Luna with the app-data directory as CWD.
    # Keep relative memory paths there so they persist outside PyInstaller temp dirs.
    return os.path.abspath(os.path.join(os.getcwd(), expanded))


def _debug_enabled() -> bool:
    return os.getenv("AGENT_MEMORY_DEBUG", "0").strip() in {"1", "true", "True", "yes", "on"}


def _debug(msg: str) -> None:
    if _debug_enabled():
        print(f"[memory] {msg}")


def load_memory_state(
    memory_file: str, max_recent_items: int
) -> tuple[str, str, list[dict[str, str]]]:
    memory_path = resolve_memory_path(memory_file)
    try:
        if not os.path.exists(memory_path):
            return "", "", []
        with open(memory_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Backward compatibility with older list-only format.
        if isinstance(data, list):
            data = {"persistent_memory": "", "summary": "", "recent_turns": data}

        if not isinstance(data, dict):
            return "", "", []

        persistent_memory = data.get("persistent_memory", "")
        if not isinstance(persistent_memory, str):
            persistent_memory = ""

        summary = data.get("summary", "")
        if not isinstance(summary, str):
            summary = ""

        recent = data.get("recent_turns", [])
        if not isinstance(recent, list):
            recent = []

        normalized: list[dict[str, str]] = []
        for item in recent:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
                normalized.append({"role": role, "content": content.strip()})
        return persistent_memory.strip(), summary.strip(), normalized[-max_recent_items:]
    except Exception as e:
        print(f"Warning: could not load memory from {memory_path}: {e}")
        return "", "", []


def save_memory_state(
    memory_file: str,
    persistent_memory: str,
    summary: str,
    recent_turns: list[dict[str, str]],
) -> None:
    memory_path = resolve_memory_path(memory_file)
    tmp_path = None
    try:
        memory_dir = os.path.dirname(memory_path) or "."
        os.makedirs(memory_dir, exist_ok=True)
        payload = {
            "persistent_memory": persistent_memory,
            "summary": summary,
            "recent_turns": recent_turns,
        }
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=memory_dir,
            delete=False,
            prefix=".memory_tmp_",
            suffix=".json",
        ) as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            tmp_path = f.name

        os.replace(tmp_path, memory_path)
        _debug(f"saved {len(recent_turns)} recent turns to {memory_path}")
    except Exception as e:
        print(f"Warning: could not save memory to {memory_path}: {e}")
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def truncate_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def compact_memory(
    summary: str,
    turns: list[dict[str, str]],
    max_recent_items: int,
    max_summary_chars: int,
) -> tuple[str, list[dict[str, str]]]:
    # Keep the sliding recent window as-is.
    recent = turns[-max_recent_items:] if len(turns) > max_recent_items else turns

    # Build fresh summary text from current conversation turns.
    lines: list[str] = ["Recent consolidated memory:"]
    for turn in turns:
        role = turn["role"].capitalize()
        content = truncate_text(turn["content"], 240)
        lines.append(f"{role}: {content}")
    merged = "\n".join(lines).strip()

    # FIFO char compaction: keep the newest max_summary_chars and drop oldest chars.
    if len(merged) > max_summary_chars:
        merged = merged[-max_summary_chars:]

    return merged, recent


def build_initial_chat_context(memory_file: str, memory_recent_items: int) -> ChatContext:
    initial_ctx = ChatContext()
    _, _, memory_recent = load_memory_state(memory_file, memory_recent_items)
    for msg in memory_recent:
        initial_ctx.add_message(role=msg["role"], content=msg["content"])
    return initial_ctx


def build_memory_instructions(
    base_persona: str, persistent_memory: str, memory_summary: str
) -> str:
    parts = [base_persona.strip(), "", MEMORY_POLICY.strip()]
    if persistent_memory.strip():
        parts.extend(
            [
                "",
                PERSISTENT_MEMORY_PREFIX,
                persistent_memory.strip(),
            ]
        )
    if memory_summary.strip():
        parts.extend(
            [
                "",
                MEMORY_SUMMARY_PREFIX,
                memory_summary.strip(),
            ]
        )
    return "\n".join(parts).strip()


class MemoryAgent(Agent):
    def __init__(
        self,
        memory_file: str,
        memory_recent_items: int,
        memory_summary_max_chars: int,
        *args,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self.memory_file = memory_file
        self.memory_recent_items = memory_recent_items
        self.memory_summary_max_chars = memory_summary_max_chars

    def _persist_chat_context(self, turn_ctx: ChatContext) -> None:
        persisted: list[dict[str, str]] = []
        for item in turn_ctx.items:
            if getattr(item, "type", None) != "message":
                continue
            role = getattr(item, "role", None)
            text = getattr(item, "text_content", None)
            if not (isinstance(text, str) and text.strip()):
                continue
            cleaned_text = text.strip()
            # Do not persist injected memory bootstrap/system guidance back into memory.
            if (
                cleaned_text.startswith(MEMORY_SUMMARY_PREFIX)
                or cleaned_text.startswith(PERSISTENT_MEMORY_PREFIX)
                or cleaned_text == MEMORY_POLICY
            ):
                continue
            # Avoid reinforcing incorrect assistant claims about lacking memory.
            if role == "assistant" and _ASSISTANT_MEMORY_DENIAL_RE.search(cleaned_text):
                continue
            if role in {"user", "assistant"}:
                persisted.append({"role": role, "content": cleaned_text})

        persistent_memory, summary, _ = load_memory_state(
            self.memory_file, self.memory_recent_items
        )

        compact_summary, compact_recent = compact_memory(
            summary=summary,
            turns=persisted,
            max_recent_items=self.memory_recent_items,
            max_summary_chars=self.memory_summary_max_chars,
        )

        save_memory_state(
            self.memory_file,
            persistent_memory,
            compact_summary,
            compact_recent,
        )
        _debug(
            "turn completed: "
            f"messages={len(persisted)}, summary_chars={len(compact_summary)}, recent={len(compact_recent)}"
        )

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        # Persist this turn's context so memory survives restarts.
        await self.update_chat_ctx(turn_ctx)
        self._persist_chat_context(turn_ctx)

    async def on_exit(self) -> None:
        # Best-effort flush on session shutdown (e.g. console Ctrl+C / key interrupt).
        try:
            self._persist_chat_context(self.chat_ctx)
        except Exception as e:
            print(f"Warning: could not persist memory on exit: {e}")
