import os
import json
import shlex
import shutil
import subprocess
from dotenv import load_dotenv
from livekit.agents import AgentSession, JobContext, WorkerOptions, cli, llm, mcp, room_io
from livekit.plugins import google
from typing import Annotated
from memory import (
    MemoryAgent,
    build_initial_chat_context,
    build_memory_instructions,
    load_memory_state,
    resolve_memory_path,
)

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_ENV_PATH = os.path.join(AGENT_DIR, ".env")

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

    def _build_agent(extra_tools: list[llm.Toolset]) -> MemoryAgent:
        return MemoryAgent(
            memory_file=memory_file,
            memory_recent_items=memory_recent_items,
            memory_summary_max_chars=memory_summary_max_chars,
            instructions=combined_instructions,
            llm=model,
            chat_ctx=initial_ctx,
            tools=[SystemTools(), *extra_tools],
        )

    # Create MCP toolsets via the current API (passing servers to AgentSession is deprecated).
    mcp_toolsets: list[mcp.MCPToolset] = []
    for index, server in enumerate(mcp_servers):
        mcp_toolsets.append(mcp.MCPToolset(id=f"mcp_toolset_{index}", mcp_server=server))

    agent = _build_agent(mcp_toolsets)

    # Create and start the session
    try:
        session = AgentSession()
        await session.start(
            agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(video_input=True),
        )
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
        await session.start(
            fallback_agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(video_input=True),
        )
    print("Session started.")

if __name__ == "__main__":
    _log_mcp_preflight()
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("AGENT_NAME", "gemini_voice_agent"),
        )
    )
