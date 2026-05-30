import os
import json
import asyncio
import time
import shutil
import uuid
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
        self._active_tasks = {}
        self._last_task_id = None

    @llm.function_tool
    async def delegate_to_antigravity(
        self,
        task: Annotated[str, "Detailed description of the coding or refactoring task to perform"]
    ) -> str:
        """Delegates a coding task to the Antigravity CLI to run in the background.
        The task runs asynchronously, and its logs are streamed in real-time to the UI page.
        """
        task_id = str(uuid.uuid4())
        self._last_task_id = task_id
        
        self._active_tasks[task_id] = {
            "id": task_id,
            "task": task,
            "status": "running",
            "start_time": time.time(),
            "output": None,
            "error": None
        }
        
        # Dispatch background runner with task ID
        asyncio.create_task(self._run_task_background(task_id, task))
        
        return f"I have successfully started the Antigravity task in the background: '{task}'. You can monitor the real-time logs and progress on the Mesh page."

    @llm.function_tool
    async def get_antigravity_task_status(self) -> str:
        """Retrieves the status, console logs, and result summary of the most recently delegated Antigravity task."""
        if not self._last_task_id or self._last_task_id not in self._active_tasks:
            return "No tasks have been delegated to Antigravity in this session yet."
            
        last_task = self._active_tasks[self._last_task_id]
        task_name = last_task.get("task")
        status = last_task.get("status")
        
        if status == "running":
            elapsed = int(time.time() - last_task.get("start_time", time.time()))
            return f"The task '{task_name}' is currently running in the background. Elapsed time: {elapsed} seconds."
            
        elif status == "success":
            output = last_task.get("output", "")
            return f"The task '{task_name}' completed successfully. Output summary: {output[:1000]}"
            
        else:
            error = last_task.get("error", "")
            return f"The task '{task_name}' failed. Error summary: {error[:1000]}"

    async def _publish_status(self, task_id: str, task: str, status: str, output: str = None, error: str = None):
        room_obj = self._get_room()
        if room_obj and hasattr(room_obj, "local_participant") and room_obj.local_participant:
            payload = {
                "type": "antigravity_task_status",
                "task_id": task_id,
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

    async def _publish_log(self, task_id: str, task: str, log_line: str):
        room_obj = self._get_room()
        if room_obj and hasattr(room_obj, "local_participant") and room_obj.local_participant:
            payload = {
                "type": "antigravity_task_log",
                "task_id": task_id,
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

    async def _run_task_background(self, task_id: str, task: str):
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
                    user_profile = os.environ.get("USERPROFILE", "")
                    if user_profile:
                        candidate_home = os.path.join(user_profile, ".antigravity", "bin", "agy.exe")
                        if os.path.exists(candidate_home):
                            agy_cmd = candidate_home
                            print(f"[Antigravity CLI] Found agy executable at: {agy_cmd}")

        if agy_cmd == "agy" and not shutil.which("agy"):
            err_msg = "Antigravity CLI ('agy') is not installed or not found in system PATH."
            print(f"\033[1;31m[Antigravity CLI] Error: {err_msg}\033[0m")
            if task_id in self._active_tasks:
                self._active_tasks[task_id]["status"] = "error"
                self._active_tasks[task_id]["error"] = err_msg
            await self._publish_status(task_id, task, "error", error=err_msg)
            return

        escaped_task = task.replace('"', '\\"')
        executable = f'"{agy_cmd}"' if " " in agy_cmd else agy_cmd
        command = f'{executable} -p "{escaped_task}" --dangerously-skip-permissions'
        
        print(f"\n\033[1;35m[Antigravity CLI] ==========================================\033[0m")
        print(f"\033[1;35m[Antigravity CLI] Starting Task: {task}\033[0m")
        print(f"\033[1;35m[Antigravity CLI] Command: {command}\033[0m")
        print(f"\033[1;35m[Antigravity CLI] ==========================================\033[0m\n")
        
        await self._publish_status(task_id, task, "running")
        
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=repo_root
            )
            
            async def read_stream(stream, name, is_error=False):
                logs = []
                color = "\033[31m" if is_error else "\033[36m"
                prefix = f"[Antigravity CLI] [{name}]"
                
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded_line = line.decode('utf-8', errors='ignore').rstrip()
                    print(f"{color}{prefix} {decoded_line}\033[0m")
                    await self._publish_log(task_id, task, decoded_line)
                    logs.append(decoded_line)
                return "\n".join(logs)

            TIMEOUT = 600 # 10 minutes
            
            try:
                stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
                stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr", is_error=True))
                
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
            else:
                print(f"\033[1;31m[Antigravity CLI] Task Failed (Exit Code: {exit_code})\033[0m\n")
                
            if task_id in self._active_tasks:
                self._active_tasks[task_id]["status"] = status
                self._active_tasks[task_id]["output"] = stdout_content
                self._active_tasks[task_id]["error"] = stderr_content

            await self._publish_status(
                task_id,
                task, 
                status, 
                output=stdout_content[:2000] if exit_code == 0 else None, 
                error=stderr_content[:2000] if exit_code != 0 else None
            )
            
        except Exception as e:
            err_msg = f"Failed to execute Antigravity CLI: {str(e)}"
            print(f"\n\033[1;31m[Antigravity CLI] Exception: {err_msg}\033[0m\n")
            if task_id in self._active_tasks:
                self._active_tasks[task_id]["status"] = "error"
                self._active_tasks[task_id]["error"] = err_msg
            await self._publish_status(task_id, task, "error", error=err_msg)
