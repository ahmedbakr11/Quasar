import os
import json
import asyncio
import time
import shutil
from typing import Annotated, Callable, Any
from livekit.agents import llm, AgentSession

class AntigravityDelegator(llm.Toolset):
    def __init__(
        self, 
        get_session: Callable[[], AgentSession | None], 
        get_room: Callable[[], Any]
    ):
        super().__init__(id="antigravity_delegator")
        self._get_session = get_session
        self._get_room = get_room

    @llm.function_tool
    async def delegate_to_antigravity(
        self,
        task: Annotated[str, "Detailed description of the coding or refactoring task to perform"]
    ) -> str:
        """Delegates a coding task to the Antigravity CLI, streams logs to the UI, 
        and returns a verbal summary of the execution outcome once completed.
        """
        # Run task and wait for it to finish (or timeout)
        return await self._run_task_and_get_summary(task)

    async def _publish_status(self, task: str, status: str, output: str = None, error: str = None):
        room_obj = self._get_room()
        if room_obj and hasattr(room_obj, "local_participant") and room_obj.local_participant:
            payload = {
                "type": "antigravity_task_status",
                "task": task,
                "status": status,
                "output": output,
                "error": error,
                "timestamp": time.time()
            }
            try:
                await room_obj.local_participant.publish_data(
                    json.dumps(payload).encode('utf-8')
                )
            except Exception as pe:
                print(f"Failed to publish task status to data channel: {pe}")

    async def _publish_log(self, task: str, log_line: str):
        room_obj = self._get_room()
        if room_obj and hasattr(room_obj, "local_participant") and room_obj.local_participant:
            payload = {
                "type": "antigravity_task_log",
                "task": task,
                "log": log_line,
                "timestamp": time.time()
            }
            try:
                await room_obj.local_participant.publish_data(
                    json.dumps(payload).encode('utf-8')
                )
            except Exception:
                pass

    async def _run_task_and_get_summary(self, task: str) -> str:
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Self-healing binary path resolution for Windows
        agy_cmd = "agy"
        if not shutil.which(agy_cmd):
            local_app_data = os.environ.get("LOCALAPPDATA", "")
            if local_app_data:
                candidate = os.path.join(local_app_data, "agy", "bin", "agy.exe")
                if os.path.exists(candidate):
                    agy_cmd = candidate
                    print(f"[Antigravity CLI] Found agy executable at: {agy_cmd}")
                else:
                    # Fallback user home directory check
                    user_profile = os.environ.get("USERPROFILE", "")
                    if user_profile:
                        candidate_home = os.path.join(user_profile, ".antigravity", "bin", "agy.exe")
                        if os.path.exists(candidate_home):
                            agy_cmd = candidate_home
                            print(f"[Antigravity CLI] Found agy executable at: {agy_cmd}")

        # If we still can't find it, notify user directly
        if agy_cmd == "agy" and not shutil.which("agy"):
            err_msg = "Antigravity CLI ('agy') is not installed or not found in system PATH."
            print(f"\033[1;31m[Antigravity CLI] Error: {err_msg}\033[0m")
            await self._publish_status(task, "error", error=err_msg)
            return f"Error: I could not locate the Antigravity CLI ('agy') on your machine. Please make sure it is installed and in your environment PATH."

        # Escape double quotes for shell execution
        escaped_task = task.replace('"', '\\"')
        # Wrap custom path in quotes if it contains spaces
        executable = f'"{agy_cmd}"' if " " in agy_cmd else agy_cmd
        command = f'{executable} -p "{escaped_task}" --dangerously-skip-permissions'
        
        print(f"\n\033[1;35m[Antigravity CLI] ==========================================\033[0m")
        print(f"\033[1;35m[Antigravity CLI] Starting Task: {task}\033[0m")
        print(f"\033[1;35m[Antigravity CLI] Command: {command}\033[0m")
        print(f"\033[1;35m[Antigravity CLI] ==========================================\033[0m\n")
        
        await self._publish_status(task, "running")
        
        try:
            # Spawn process
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=repo_root
            )
            
            # Helper to stream stdout/stderr
            async def read_stream(stream, name, is_error=False):
                logs = []
                color = "\033[31m" if is_error else "\033[36m"
                prefix = f"[Antigravity CLI] [{name}]"
                
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded_line = line.decode('utf-8', errors='ignore').rstrip()
                    # Print to terminal with ANSI colors
                    print(f"{color}{prefix} {decoded_line}\033[0m")
                    
                    # Stream log log line to UI
                    await self._publish_log(task, decoded_line)
                    logs.append(decoded_line)
                return "\n".join(logs)

            TIMEOUT = 600 # 10 minutes
            
            try:
                stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
                stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr", is_error=True))
                
                # Wait for the process to exit with timeout
                await asyncio.wait_for(process.wait(), timeout=TIMEOUT)
                
                stdout_content = await stdout_task
                stderr_content = await stderr_task
                exit_code = process.returncode
                print(f"\n[Antigravity CLI] Process finished with exit code {exit_code}")
                
            except asyncio.TimeoutExpired:
                print(f"\n\033[1;31m[Antigravity CLI] Task timed out after {TIMEOUT} seconds. Terminating process...\033[0m")
                try:
                    process.kill()
                except Exception as kill_err:
                    print(f"Error terminating process: {kill_err}")
                
                stdout_task.cancel()
                stderr_task.cancel()
                exit_code = -1
                stdout_content = "Task timed out."
                stderr_content = f"Execution exceeded {TIMEOUT}s limit."

            status = "success" if exit_code == 0 else "error"
            if exit_code == 0:
                print("\033[1;32m[Antigravity CLI] Task Completed Successfully\033[0m\n")
                summary = f"The task '{task}' has been successfully completed by the Antigravity agent."
            else:
                print(f"\033[1;31m[Antigravity CLI] Task Failed (Exit Code: {exit_code})\033[0m\n")
                summary = f"The task '{task}' failed during execution with exit code {exit_code}. The error logs say: {stderr_content[:200]}"
            
            # Send final status update to UI
            await self._publish_status(
                task, 
                status, 
                output=stdout_content[:2000] if exit_code == 0 else None, 
                error=stderr_content[:2000] if exit_code != 0 else None
            )
            
            # Return result summary back to Gemini model to speak verbally
            return summary
            
        except Exception as e:
            err_msg = f"Failed to execute Antigravity CLI: {str(e)}"
            print(f"\n\033[1;31m[Antigravity CLI] Exception: {err_msg}\033[0m\n")
            await self._publish_status(task, "error", error=err_msg)
            return f"An exception occurred while trying to run the Antigravity agent: {str(e)}"
