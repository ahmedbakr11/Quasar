import os
import json
import shlex
import shutil
import subprocess
import sqlite3
from pathlib import Path
from dotenv import load_dotenv
from livekit.agents import AgentSession, JobContext, WorkerOptions, cli, llm, mcp, room_io
from livekit.plugins import google
from typing import Annotated, Callable
from memory import (
    MemoryAgent,
    build_initial_chat_context,
    build_memory_instructions,
    load_memory_state,
    resolve_memory_path,
)

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_ENV_PATH = os.path.join(AGENT_DIR, ".env")
LUNA_IMAGE_ENVELOPE_PREFIX = "[[LUNA_IMAGE_V1]]"

# Always load env from Luna_Agent/.env regardless of caller working directory.
dotenv_loaded = load_dotenv(dotenv_path=AGENT_ENV_PATH, override=False)
if dotenv_loaded:
    print(f"Loaded environment from: {AGENT_ENV_PATH}")
else:
    print(
        f"Environment file not found at expected path: {AGENT_ENV_PATH}. "
        "Falling back to process environment only."
    )


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_mcp_args(raw_args: str) -> list[str]:
    if not raw_args:
        return []

    stripped = raw_args.strip()
    if stripped.startswith("["):
        parsed = json.loads(stripped)
        if not isinstance(parsed, list):
            raise ValueError("GOOGLE_WORKSPACE_MCP_ARGS JSON must be a list of strings.")
        if not all(isinstance(item, str) for item in parsed):
            raise ValueError("GOOGLE_WORKSPACE_MCP_ARGS JSON list must contain only strings.")
        return parsed

    return shlex.split(stripped, posix=False)


def _parse_allowed_tools(raw_tools: str) -> list[str]:
    if not raw_tools:
        return []

    return [tool.strip() for tool in raw_tools.split(",") if tool.strip()]


def _build_google_workspace_mcp_servers() -> list[mcp.MCPServer]:
    mcp_enabled = _env_flag("GOOGLE_WORKSPACE_MCP_ENABLED", default=False)
    if not mcp_enabled:
        print("MCP disabled: GOOGLE_WORKSPACE_MCP_ENABLED is not truthy.")
        return []

    command = os.getenv("GOOGLE_WORKSPACE_MCP_COMMAND", "uvx").strip()
    if not command:
        raise ValueError("GOOGLE_WORKSPACE_MCP_COMMAND is empty.")
    if shutil.which(command) is None:
        raise FileNotFoundError(
            f"MCP command not found in PATH: {command}. Install it or disable GOOGLE_WORKSPACE_MCP_ENABLED."
        )

    args = _parse_mcp_args(
        os.getenv(
            "GOOGLE_WORKSPACE_MCP_ARGS",
            '["google-workspace-mcp","--transport","stdio"]',
        )
    )
    timeout_seconds = float(os.getenv("GOOGLE_WORKSPACE_MCP_TIMEOUT_SECONDS", "30"))
    allowed_tools = _parse_allowed_tools(os.getenv("GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS", ""))
    child_env = os.environ.copy()

    print(
        "MCP enabled:",
        "server=google-workspace-mcp",
        f"command={command}",
        f"args={args}",
        f"allowed_tools={len(allowed_tools) if allowed_tools else 'all'}",
        f"timeout={timeout_seconds}s",
    )

    # Compatibility across livekit-agents versions:
    # newer signatures may support name/timeout/allowed_tools,
    # older ones may only accept command/args.
    constructor_variants = [
        {
            "command": command,
            "args": args,
            "env": child_env,
            "client_session_timeout_seconds": timeout_seconds,
        },
        {
            "command": command,
            "args": args,
            "env": child_env,
        },
    ]

    last_error = None
    for kwargs in constructor_variants:
        try:
            server = mcp.MCPServerStdio(**kwargs)
            if allowed_tools:
                print(
                    "MCP note: this livekit-agents version does not support allowed-tools"
                    " filtering on MCPServerStdio; exposing all MCP tools."
                )
            return [server]
        except TypeError as e:
            last_error = e
            continue

    raise TypeError(f"Unable to initialize MCPServerStdio with supported signatures: {last_error}")


def _log_mcp_preflight() -> None:
    enabled = _env_flag("GOOGLE_WORKSPACE_MCP_ENABLED", default=False)
    command = os.getenv("GOOGLE_WORKSPACE_MCP_COMMAND", "uvx").strip()
    args_raw = os.getenv("GOOGLE_WORKSPACE_MCP_ARGS", "")
    has_client_id = bool(os.getenv("GOOGLE_WORKSPACE_CLIENT_ID"))
    has_client_secret = bool(os.getenv("GOOGLE_WORKSPACE_CLIENT_SECRET"))
    has_refresh_token = bool(os.getenv("GOOGLE_WORKSPACE_REFRESH_TOKEN"))
    command_found = shutil.which(command) is not None if command else False

    print(
        "MCP preflight:",
        f"enabled={enabled}",
        f"command={command or '<empty>'}",
        f"command_found={command_found}",
        f"args_set={bool(args_raw.strip())}",
        f"client_id_set={has_client_id}",
        f"client_secret_set={has_client_secret}",
        f"refresh_token_set={has_refresh_token}",
    )


class SystemTools(llm.Toolset):
    def __init__(self):
        super().__init__(id="system_tools")

   
    @llm.function_tool
    async def run_command(
        self,
        command: Annotated[str, "The shell command to execute"]
    ) -> str:
        """Executes a shell command and returns the output."""
        try:
            result = subprocess.run(
                command, 
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            output = (result.stdout + result.stderr).strip()
            if len(output) > 2000:
                output = output[:2000] + "\n[Output truncated]"
            return output or "Command executed successfully with no output."
        except subprocess.TimeoutExpired:
            return "Error: Command timed out after 30 seconds."
        except FileNotFoundError:
            return "Error: Command not found."
        except Exception as e:
            return f"Error executing command: {str(e)}"

    @llm.function_tool
    async def file_operation(
        self,
        operation: Annotated[str, "Operation to perform: 'read', 'write', or 'list'"],
        path: Annotated[str, "File or directory path"],
        content: Annotated[str, "Content to write (only required for 'write')"] = ""
    ) -> str:
        """Read, write, or list files and directories."""
        try:
            if operation == "list":
                entries = os.listdir(path)
                return "\n".join(entries) or "Directory is empty."
            
            elif operation == "read":
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read(8000)
                return content or "File is empty."
            
            elif operation == "write":
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
                return f"Written successfully to {path}."
            
            else:
                return "Error: operation must be 'read', 'write', or 'list'."
        
        except FileNotFoundError:
            return f"Error: Path not found: {path}"
        except PermissionError:
            return f"Error: Permission denied: {path}"
        except Exception as e:
            return f"Error: {str(e)}"


class TaskTools(llm.Toolset):
    def __init__(self, username_provider: Callable[[], str | None]):
        super().__init__(id="task_tools")
        self._username_provider = username_provider

    def _resolve_db_path(self) -> Path:
        explicit = os.getenv("QUASAR_DB_PATH", "").strip()
        if explicit:
            candidate = Path(explicit)
            if candidate.exists():
                return candidate
        appdata = os.getenv("APPDATA", "").strip()
        if appdata:
            candidate = Path(appdata) / "com.quasar.app" / "luna.db"
            if candidate.exists():
                return candidate
        raise FileNotFoundError(
            "Quasar DB not found. Set QUASAR_DB_PATH to your luna.db path."
        )

    def _connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._resolve_db_path())
        conn.row_factory = sqlite3.Row
        return conn

    def _require_user_id(self, conn: sqlite3.Connection) -> str:
        username = (self._username_provider() or "").strip().lower()
        if not username:
            raise ValueError("No connected caller identity was found in LiveKit session.")
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is None:
            raise ValueError(f"No app user mapped to caller identity '{username}'.")
        return str(row["id"])

    def _load_task(self, conn: sqlite3.Connection, user_id: str, task_id: str) -> dict:
        row = conn.execute(
            "SELECT id, title, description, due_date, priority, status, color_token, position, created_at, updated_at "
            "FROM tasks WHERE id = ? AND user_id = ?",
            (task_id, user_id),
        ).fetchone()
        if row is None:
            raise ValueError("Task not found.")
        subtasks = conn.execute(
            "SELECT id, text, done FROM task_subtasks WHERE task_id = ? ORDER BY position ASC",
            (task_id,),
        ).fetchall()
        return {
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "dueDate": row["due_date"],
            "priority": row["priority"],
            "status": row["status"],
            "colorToken": row["color_token"],
            "position": row["position"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "subtasks": [
                {"id": s["id"], "text": s["text"], "done": bool(s["done"])}
                for s in subtasks
            ],
        }

    @llm.function_tool
    async def view_tasks(
        self,
        status: Annotated[str, "Optional status filter: todo, in_progress, done. Leave empty for all."] = "",
    ) -> str:
        """List current tasks for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                if status.strip():
                    rows = conn.execute(
                        "SELECT id FROM tasks WHERE user_id = ? AND status = ? ORDER BY updated_at ASC",
                        (user_id, status.strip()),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT id FROM tasks WHERE user_id = ? ORDER BY updated_at ASC",
                        (user_id,),
                    ).fetchall()
                tasks = [self._load_task(conn, user_id, str(r["id"])) for r in rows]
                return json.dumps(tasks, ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def add_task(
        self,
        title: Annotated[str, "Task title"],
        due_date: Annotated[str, "Due date in YYYY-MM-DD format"],
        description: Annotated[str, "Task description"] = "",
        priority: Annotated[str, "Priority: high, medium, low"] = "medium",
        status: Annotated[str, "Status: todo, in_progress, done"] = "todo",
        color_token: Annotated[str, "Color token"] = "slate",
        subtasks_json: Annotated[str, "JSON array of subtask strings, e.g. [\"a\",\"b\"]"] = "[]",
    ) -> str:
        """Create a task for the connected caller."""
        try:
            parsed = json.loads(subtasks_json) if subtasks_json.strip() else []
            if not isinstance(parsed, list):
                return "Error: subtasks_json must be a JSON array of strings."
            clean_subtasks = [str(x).strip() for x in parsed if str(x).strip()]
            now = __import__("datetime").datetime.utcnow().isoformat() + "Z"
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                next_pos_row = conn.execute(
                    "SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = ?",
                    (user_id, status),
                ).fetchone()
                next_pos = int(next_pos_row["c"]) if next_pos_row else 0
                task_id = __import__("uuid").uuid4().hex
                conn.execute(
                    "INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, color_token, position, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        task_id,
                        user_id,
                        title.strip(),
                        description.strip(),
                        due_date.strip(),
                        priority.strip(),
                        status.strip(),
                        color_token.strip(),
                        next_pos,
                        now,
                        now,
                    ),
                )
                for idx, text in enumerate(clean_subtasks):
                    conn.execute(
                        "INSERT INTO task_subtasks (id, task_id, text, done, position) VALUES (?, ?, ?, 0, ?)",
                        (__import__("uuid").uuid4().hex, task_id, text, idx),
                    )
                conn.commit()
                return json.dumps(self._load_task(conn, user_id, task_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def edit_task(
        self,
        task_id: Annotated[str, "Task id"],
        title: Annotated[str, "Optional new title"] = "",
        description: Annotated[str, "Optional new description"] = "",
        due_date: Annotated[str, "Optional new due date (YYYY-MM-DD)"] = "",
        priority: Annotated[str, "Optional new priority"] = "",
        status: Annotated[str, "Optional new status"] = "",
        color_token: Annotated[str, "Optional new color token"] = "",
    ) -> str:
        """Edit an existing task for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                existing = conn.execute(
                    "SELECT title, description, due_date, priority, status, color_token FROM tasks WHERE id = ? AND user_id = ?",
                    (task_id, user_id),
                ).fetchone()
                if existing is None:
                    return "Error: Task not found."
                next_values = (
                    title.strip() or existing["title"],
                    description.strip() or existing["description"],
                    due_date.strip() or existing["due_date"],
                    priority.strip() or existing["priority"],
                    status.strip() or existing["status"],
                    color_token.strip() or existing["color_token"],
                    __import__("datetime").datetime.utcnow().isoformat() + "Z",
                    task_id,
                    user_id,
                )
                conn.execute(
                    "UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, color_token = ?, updated_at = ? "
                    "WHERE id = ? AND user_id = ?",
                    next_values,
                )
                conn.commit()
                return json.dumps(self._load_task(conn, user_id, task_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def check_subtask(
        self,
        task_id: Annotated[str, "Task id"],
        subtask_id: Annotated[str, "Subtask id"],
    ) -> str:
        """Toggle a subtask check state."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                owns = conn.execute(
                    "SELECT COUNT(*) AS c FROM tasks WHERE id = ? AND user_id = ?",
                    (task_id, user_id),
                ).fetchone()
                if owns is None or int(owns["c"]) == 0:
                    return "Error: Task not found."
                conn.execute(
                    "UPDATE task_subtasks SET done = CASE done WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND task_id = ?",
                    (subtask_id, task_id),
                )
                conn.execute(
                    "UPDATE tasks SET updated_at = ? WHERE id = ?",
                    (__import__("datetime").datetime.utcnow().isoformat() + "Z", task_id),
                )
                conn.commit()
                return json.dumps(self._load_task(conn, user_id, task_id), ensure_ascii=False)
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

    @llm.function_tool
    async def delete_task(
        self,
        task_id: Annotated[str, "Task id"],
    ) -> str:
        """Delete a task for the connected caller."""
        try:
            conn = self._connection()
            try:
                user_id = self._require_user_id(conn)
                conn.execute(
                    "DELETE FROM task_subtasks WHERE task_id = ?",
                    (task_id,),
                )
                deleted = conn.execute(
                    "DELETE FROM tasks WHERE id = ? AND user_id = ?",
                    (task_id, user_id),
                ).rowcount
                conn.commit()
                if not deleted:
                    return "Error: Task not found."
                return "Task deleted."
            finally:
                conn.close()
        except Exception as e:
            return f"Error: {e}"

async def entrypoint(ctx: JobContext):
    print("Starting agent...")

    # Connect to the LiveKit room
    await ctx.connect()

    # Use an explicit realtime model from env when provided.
    # Otherwise let the LiveKit plugin choose its API-appropriate default.
    selected_model = os.getenv("GEMINI_REALTIME_MODEL")
    selected_voice = os.getenv("AGENT_VOICE", "Puck")
    persona = os.getenv(
        "AGENT_PERSONA",
        "You are a helpful system assistant. You can execute shell commands, call Gemini CLI directly, and manage files on the user's machine using the provided tools. Be concise and professional.",
    )
    memory_file = os.getenv("AGENT_MEMORY_FILE", "memory.json")
    memory_recent_items = int(os.getenv("AGENT_MEMORY_RECENT_ITEMS", "12"))
    memory_summary_max_chars = int(os.getenv("AGENT_MEMORY_SUMMARY_MAX_CHARS", "3000"))
    resolved_memory_path = resolve_memory_path(memory_file)

    loaded_persistent, loaded_summary, loaded_recent = load_memory_state(
        memory_file, memory_recent_items
    )
    combined_instructions = build_memory_instructions(
        persona, loaded_persistent, loaded_summary
    )
    model_kwargs = {
        "instructions": combined_instructions,
        "voice": selected_voice,
    }
    if selected_model:
        model_kwargs["model"] = selected_model

    model = google.realtime.RealtimeModel(**model_kwargs)
    initial_ctx = build_initial_chat_context(memory_file, memory_recent_items)
    try:
        mcp_servers = []
        mcp_servers.extend(_build_google_workspace_mcp_servers())
    except Exception as e:
        print(f"MCP startup disabled due to configuration error: {e}")
        mcp_servers = []
    print(
        "Memory initialized:",
        f"path={resolved_memory_path}",
        f"persistent_chars={len(loaded_persistent)}",
        f"summary_chars={len(loaded_summary)}",
        f"recent_turns={len(loaded_recent)}",
    )

    def _resolve_livekit_username() -> str | None:
        room = getattr(ctx, "room", None)
        if room is None:
            return None
        remote = getattr(room, "remote_participants", None)
        values = []
        if hasattr(remote, "values"):
            try:
                values = list(remote.values())
            except Exception:
                values = []
        elif isinstance(remote, list):
            values = remote
        for participant in values:
            identity = str(getattr(participant, "identity", "") or "").strip()
            if identity:
                return identity
        return None

    def _build_agent(extra_tools: list[llm.Toolset]) -> MemoryAgent:
        return MemoryAgent(
            memory_file=memory_file,
            memory_recent_items=memory_recent_items,
            memory_summary_max_chars=memory_summary_max_chars,
            instructions=combined_instructions,
            llm=model,
            chat_ctx=initial_ctx,
            tools=[SystemTools(), TaskTools(_resolve_livekit_username), *extra_tools],
        )

    # Create MCP toolsets via the current API (passing servers to AgentSession is deprecated).
    mcp_toolsets: list[mcp.MCPToolset] = []
    for index, server in enumerate(mcp_servers):
        mcp_toolsets.append(mcp.MCPToolset(id=f"mcp_toolset_{index}", mcp_server=server))

    agent = _build_agent(mcp_toolsets)

    async def _text_input_cb(sess: AgentSession, ev: room_io.TextInputEvent) -> None:
        await sess.interrupt()
        text = ev.text or ""
        if not text.startswith(LUNA_IMAGE_ENVELOPE_PREFIX):
            sess.generate_reply(user_input=text)
            return

        raw = text[len(LUNA_IMAGE_ENVELOPE_PREFIX) :].strip()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            sess.generate_reply(user_input=text)
            return

        if not isinstance(payload, dict) or payload.get("type") != "image_message":
            sess.generate_reply(user_input=text)
            return

        image_data_url = payload.get("imageDataUrl")
        if not isinstance(image_data_url, str) or not image_data_url.strip():
            sess.generate_reply(user_input=text)
            return

        user_text = payload.get("text", "")
        if not isinstance(user_text, str):
            user_text = ""
        user_text = user_text.strip() or "Please analyze this image."

        mime_type = payload.get("mimeType")
        if not isinstance(mime_type, str) or not mime_type.strip():
            mime_type = None

        chat_message = llm.ChatMessage(
            role="user",
            content=[
                user_text,
                llm.ImageContent(image=image_data_url, mime_type=mime_type),
            ],
        )
        sess.generate_reply(user_input=chat_message)

    async def _start_with_optional_video_input(
        session_obj: AgentSession,
        agent_obj: MemoryAgent,
    ) -> None:
        try:
            await session_obj.start(
                agent_obj,
                room=ctx.room,
                room_options=room_io.RoomOptions(
                    video_input=True,
                    text_input=room_io.TextInputOptions(text_input_cb=_text_input_cb),
                ),
            )
        except Exception as start_err:
            print(f"Video input start failed, retrying without video input: {start_err}")
            await session_obj.start(
                agent_obj,
                room=ctx.room,
                room_options=room_io.RoomOptions(
                    text_input=room_io.TextInputOptions(text_input_cb=_text_input_cb),
                ),
            )

    # Create and start the session
    try:
        session = AgentSession()
        await _start_with_optional_video_input(session, agent)
    except Exception as e:
        # If LiveKit indicates an activity is already running for this session,
        # don't attempt a second start.
        if "activity is already running" in str(e).lower():
            print(f"Session start skipped: {e}")
            return
        if not mcp_servers:
            raise
        print(f"MCP session startup failed, retrying without MCP: {e}")
        fallback_agent = _build_agent([])
        session = AgentSession()
        await _start_with_optional_video_input(session, fallback_agent)
    print("Session started.")

if __name__ == "__main__":
    _log_mcp_preflight()
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("AGENT_NAME", "gemini_voice_agent"),
        )
    )
