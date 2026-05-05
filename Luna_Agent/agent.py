import asyncio
import os
import shutil
import subprocess
from dotenv import load_dotenv
from livekit.agents import AgentSession, JobContext, WorkerOptions, cli, llm
from livekit.plugins import google
from typing import Annotated
from memory import (
    MemoryAgent,
    build_initial_chat_context,
    build_memory_instructions,
    load_memory_state,
    resolve_memory_path,
)

load_dotenv()


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
    print(
        "Memory initialized:",
        f"path={resolved_memory_path}",
        f"persistent_chars={len(loaded_persistent)}",
        f"summary_chars={len(loaded_summary)}",
        f"recent_turns={len(loaded_recent)}",
    )

    # Create the Agent configuration
    agent = MemoryAgent(
        memory_file=memory_file,
        memory_recent_items=memory_recent_items,
        memory_summary_max_chars=memory_summary_max_chars,
        instructions=combined_instructions,
        llm=model,
        chat_ctx=initial_ctx,
        tools=[SystemTools()]
    )

    # Create and start the session
    session = AgentSession()
    await session.start(agent, room=ctx.room)
    print("Session started.")

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("AGENT_NAME", "gemini_voice_agent"),
        )
    )
