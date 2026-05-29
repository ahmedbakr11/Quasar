import os
import json
import asyncio
import time
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
        """Delegates a coding task to the Antigravity CLI to run in the background.
        The agent will notify the user verbally when it completes.
        """
        asyncio.create_task(self._run_task_and_notify(task))
        return "I have started the Antigravity agent in the background to handle this task. I'll notify you as soon as it's completed."

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

    async def _run_task_and_notify(self, task: str):
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Escape double quotes for shell arguments
        escaped_task = task.replace('"', '\\"')
        command = f'agy -p "{escaped_task}" --dangerously-skip-permissions'
        
        print(f"\n\033[1;35m[Antigravity CLI] ==========================================\033[0m")
        print(f"\033[1;35m[Antigravity CLI] Starting Task: {task}\033[0m")
        print(f"\033[1;35m[Antigravity CLI] ==========================================\033[0m\n")
        
        await self._publish_status(task, "running")
        
        try:
            # Spawn process asynchronously
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=repo_root
            )
            
            # Helper to read streams line-by-line in real-time
            async def read_stream(stream, name, is_error=False):
                logs = []
                color = "\033[31m" if is_error else "\033[36m"
                prefix = f"[Antigravity CLI] [{name}]"
                
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded_line = line.decode('utf-8', errors='ignore').rstrip()
                    # Print to python agent terminal with proper colors
                    print(f"{color}{prefix} {decoded_line}\033[0m")
                    
                    # Publish progress to UI data channel
                    await self._publish_log(task, decoded_line)
                    logs.append(decoded_line)
                return "\n".join(logs)

            # Enforce 10-minute timeout (600 seconds)
            TIMEOUT = 600
            
            try:
                stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
                stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr", is_error=True))
                
                # Wait for the process to exit with a 10 min timeout
                await asyncio.wait_for(process.wait(), timeout=TIMEOUT)
                
                # Retrieve final streams
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

            # Final status reporting
            status = "success" if exit_code == 0 else "error"
            if exit_code == 0:
                print("\033[1;32m[Antigravity CLI] Task Completed Successfully\033[0m\n")
                report = f"Antigravity successfully completed the task: '{task}'."
            else:
                print(f"\033[1;31m[Antigravity CLI] Task Failed (Exit Code: {exit_code})\033[0m\n")
                report = f"Antigravity failed the task: '{task}' with exit code {exit_code}."
            
            # Notify Voice Agent
            session = self._get_session()
            if session:
                chat_msg = llm.ChatMessage(
                    role="system",
                    content=f"Background task update: {report}. Tell the user the task is finished."
                )
                session.generate_reply(user_input=chat_msg)
            
            # Notify UI Component
            await self._publish_status(
                task, 
                status, 
                output=stdout_content[:2000] if exit_code == 0 else None, 
                error=stderr_content[:2000] if exit_code != 0 else None
            )
            
        except Exception as e:
            err_msg = f"Failed to execute Antigravity CLI: {str(e)}"
            print(f"\n\033[1;31m[Antigravity CLI] Exception: {err_msg}\033[0m\n")
            session = self._get_session()
            if session:
                session.generate_reply(
                    user_input=llm.ChatMessage(
                        role="system",
                        content=f"Notify the user that running Antigravity failed with error: {str(e)}"
                    )
                )
            await self._publish_status(task, "error", error=err_msg)
