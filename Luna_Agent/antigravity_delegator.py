import asyncio
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Annotated, Any, Callable

from livekit.agents import AgentSession, llm


QUIRK_TOPIC = "quasar.quirk.antigravity"
MAX_PACKET_LINE_CHARS = 6000
MAX_SUMMARY_CHARS = 2000
LOG_TAIL_POLL_SECONDS = 0.35


class AntigravityDelegator(llm.Toolset):
    def __init__(
        self,
        get_session: Callable[[], AgentSession | None],
        get_room: Callable[[], Any],
    ):
        super().__init__(id="antigravity_delegator")
        self._get_session = get_session
        self._get_room = get_room
        self._active_tasks: dict[str, dict[str, Any]] = {}
        self._last_task_id: str | None = None
        self._sequence_by_task: dict[str, int] = {}

    @llm.function_tool
    async def delegate_to_antigravity(
        self,
        task: Annotated[str, "Detailed description of the coding or refactoring task to perform"],
    ) -> str:
        """Delegates a coding task to Antigravity CLI and streams Quirk progress to Mesh."""
        clean_task = task.strip()
        if not clean_task:
            return "Error: Antigravity task cannot be empty."

        task_id = str(uuid.uuid4())
        started_at = self._now_ms()
        self._last_task_id = task_id
        self._sequence_by_task[task_id] = 0
        self._active_tasks[task_id] = {
            "id": task_id,
            "title": clean_task,
            "status": "running",
            "started_at": started_at,
            "output": "",
            "error": "",
            "process": None,
            "cancel_requested": False,
        }

        asyncio.create_task(self._run_task_background(task_id, clean_task, started_at))

        return (
            f"I started the Antigravity task in the background: '{clean_task}'. "
            "You can monitor stdout, diagnostics, and progress in the Mesh Quirk widget."
        )

    @llm.function_tool
    async def get_antigravity_task_status(self) -> str:
        """Retrieves the status and result summary of the most recently delegated Antigravity task."""
        if not self._last_task_id or self._last_task_id not in self._active_tasks:
            return "No tasks have been delegated to Antigravity in this session yet."

        last_task = self._active_tasks[self._last_task_id]
        title = last_task.get("title", "Delegated task")
        status = last_task.get("status", "running")

        if status == "running":
            elapsed = int(time.time() - (last_task.get("started_at", self._now_ms()) / 1000))
            return f"The task '{title}' is currently running in the background. Elapsed time: {elapsed} seconds."
        if status == "success":
            output = str(last_task.get("output", ""))
            return f"The task '{title}' completed successfully. Output summary: {output[:1000]}"
        if status == "cancelled":
            return f"The task '{title}' was cancelled."

        error = str(last_task.get("error", ""))
        return f"The task '{title}' failed. Error summary: {error[:1000]}"

    def kill_task(self, task_id: str):
        """Kills the active Antigravity subprocess for the given task ID."""
        task_info = self._active_tasks.get(task_id)
        if not task_info:
            return

        process = task_info.get("process")
        if not process or task_info.get("status") != "running":
            return

        task_info["cancel_requested"] = True
        task_info["status"] = "cancelled"
        title = str(task_info.get("title") or "Delegated task")
        pid = getattr(process, "pid", None)
        print(f"[Quirk] Terminating Antigravity task {task_id} (PID: {pid}) on user request")
        asyncio.create_task(self._publish_log(task_id, title, "lifecycle", "Terminate requested by user."))
        asyncio.create_task(
            self._publish_status(
                task_id,
                title,
                "cancelled",
                started_at=task_info.get("started_at"),
                ended_at=self._now_ms(),
                error="Terminated by user.",
            )
        )

        try:
            if os.name == "nt" and pid:
                res = subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                print(f"[Quirk] taskkill stdout: {res.stdout.strip()}")
                if res.stderr.strip():
                    print(f"[Quirk] taskkill stderr: {res.stderr.strip()}")
            else:
                process.kill()
        except Exception as kill_err:
            print(f"[Quirk] Error terminating process: {kill_err}")

    async def _run_task_background(self, task_id: str, title: str, started_at: int):
        repo_root = Path(__file__).resolve().parent.parent
        agy_cmd = self._resolve_agy_command()

        if not agy_cmd:
            err_msg = "Antigravity CLI ('agy') is not installed or not found in system PATH."
            print(f"[Quirk] {err_msg}")
            self._active_tasks[task_id]["status"] = "error"
            self._active_tasks[task_id]["error"] = err_msg
            await self._publish_status(
                task_id,
                title,
                "error",
                started_at=started_at,
                ended_at=self._now_ms(),
                error=err_msg,
            )
            return

        log_file = self._resolve_log_file(repo_root, task_id)
        args = [
            agy_cmd,
            "--print",
            title,
            "--print-timeout",
            "10m",
            "--log-file",
            str(log_file),
            "--dangerously-skip-permissions",
        ]
        env = os.environ.copy()
        env["NO_COLOR"] = "1"
        env["TERM"] = "dumb"

        await self._publish_status(task_id, title, "running", started_at=started_at)
        await self._publish_log(task_id, title, "lifecycle", f"Starting Antigravity CLI in {repo_root}")
        await self._publish_log(task_id, title, "lifecycle", f"Diagnostic log: {log_file}")

        print("[Quirk] ==========================================")
        print(f"[Quirk] Starting Antigravity task: {title}")
        print(f"[Quirk] Command args: {args}")
        print("[Quirk] ==========================================")

        stdout_task: asyncio.Task[str] | None = None
        stderr_task: asyncio.Task[str] | None = None
        diagnostic_task: asyncio.Task[None] | None = None
        process = None
        exit_code: int | None = None
        stdout_content = ""
        stderr_content = ""

        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(repo_root),
                env=env,
            )
            self._active_tasks[task_id]["process"] = process

            stdout_task = asyncio.create_task(self._read_stream(process.stdout, task_id, title, "stdout"))
            stderr_task = asyncio.create_task(self._read_stream(process.stderr, task_id, title, "stderr"))
            diagnostic_task = asyncio.create_task(self._tail_log_file(log_file, task_id, title))

            try:
                await asyncio.wait_for(process.wait(), timeout=610)
                exit_code = process.returncode
            except asyncio.TimeoutError:
                self._active_tasks[task_id]["cancel_requested"] = True
                self._active_tasks[task_id]["status"] = "error"
                await self._publish_log(task_id, title, "lifecycle", "Task timed out after 10 minutes. Terminating.")
                await self._terminate_process(process)
                exit_code = -1
                stderr_content = "Execution exceeded the 10 minute limit."

            stdout_content = await self._finish_reader(stdout_task)
            extra_stderr = await self._finish_reader(stderr_task)
            if extra_stderr:
                stderr_content = "\n".join(part for part in [stderr_content, extra_stderr] if part)

            if diagnostic_task:
                diagnostic_task.cancel()
                try:
                    await diagnostic_task
                except asyncio.CancelledError:
                    pass

            ended_at = self._now_ms()
            cancelled = bool(self._active_tasks.get(task_id, {}).get("cancel_requested"))
            if cancelled:
                status = "cancelled"
                final_error = stderr_content or "Terminated by user."
            else:
                status = "success" if exit_code == 0 else "error"
                final_error = stderr_content if status == "error" else None

            self._active_tasks[task_id]["status"] = status
            self._active_tasks[task_id]["output"] = stdout_content
            self._active_tasks[task_id]["error"] = final_error or ""

            await self._publish_log(task_id, title, "lifecycle", f"Antigravity exited with code {exit_code}.")
            await self._publish_status(
                task_id,
                title,
                status,
                started_at=started_at,
                ended_at=ended_at,
                exit_code=exit_code,
                output=stdout_content[:MAX_SUMMARY_CHARS] if status == "success" else None,
                error=(final_error or "")[:MAX_SUMMARY_CHARS] if status != "success" else None,
            )
        except Exception as e:
            err_msg = f"Failed to execute Antigravity CLI: {e}"
            print(f"[Quirk] {err_msg}")
            self._active_tasks[task_id]["status"] = "error"
            self._active_tasks[task_id]["error"] = err_msg
            await self._publish_log(task_id, title, "lifecycle", err_msg)
            await self._publish_status(
                task_id,
                title,
                "error",
                started_at=started_at,
                ended_at=self._now_ms(),
                exit_code=exit_code,
                error=err_msg,
            )
        finally:
            if diagnostic_task and not diagnostic_task.done():
                diagnostic_task.cancel()
            if task_id in self._active_tasks:
                self._active_tasks[task_id]["process"] = None

    def _resolve_agy_command(self) -> str | None:
        if shutil.which("agy"):
            return "agy"

        candidates: list[Path] = []
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if local_app_data:
            candidates.append(Path(local_app_data) / "agy" / "bin" / "agy.exe")

        user_profile = os.environ.get("USERPROFILE", "")
        if user_profile:
            candidates.append(Path(user_profile) / ".antigravity" / "bin" / "agy.exe")
            candidates.append(Path(user_profile) / ".local" / "bin" / "agy")

        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
        return None

    def _resolve_log_file(self, repo_root: Path, task_id: str) -> Path:
        log_root = repo_root / "generated" / "quirk_logs"
        log_root.mkdir(parents=True, exist_ok=True)
        return log_root / f"{task_id}.log"

    async def _read_stream(self, stream: Any, task_id: str, title: str, stream_name: str) -> str:
        if stream is None:
            return ""

        lines: list[str] = []
        buffer = ""
        while True:
            chunk = await stream.read(1024)
            if not chunk:
                break

            buffer += chunk.decode("utf-8", errors="replace")
            complete, buffer = self._split_complete_lines(buffer)
            for line in complete:
                cleaned = self._clean_line(line)
                if not cleaned:
                    continue
                lines.append(cleaned)
                await self._publish_log(task_id, title, stream_name, cleaned)

        cleaned = self._clean_line(buffer)
        if cleaned:
            lines.append(cleaned)
            await self._publish_log(task_id, title, stream_name, cleaned)
        return "\n".join(lines)

    async def _tail_log_file(self, log_file: Path, task_id: str, title: str) -> None:
        position = 0
        buffer = ""
        while True:
            try:
                if log_file.exists():
                    size = log_file.stat().st_size
                    if size < position:
                        position = 0
                        buffer = ""
                    if size > position:
                        with log_file.open("r", encoding="utf-8", errors="replace") as fh:
                            fh.seek(position)
                            data = fh.read()
                            position = fh.tell()
                        buffer += data
                        complete, buffer = self._split_complete_lines(buffer)
                        for line in complete:
                            cleaned = self._clean_line(line)
                            if cleaned:
                                await self._publish_log(task_id, title, "diagnostic", cleaned)
                await asyncio.sleep(LOG_TAIL_POLL_SECONDS)
            except asyncio.CancelledError:
                cleaned = self._clean_line(buffer)
                if cleaned:
                    await self._publish_log(task_id, title, "diagnostic", cleaned)
                raise
            except Exception as e:
                await self._publish_log(task_id, title, "diagnostic", f"Failed to read diagnostic log: {e}")
                await asyncio.sleep(1)

    async def _finish_reader(self, task: asyncio.Task[str] | None) -> str:
        if task is None:
            return ""
        try:
            return await task
        except asyncio.CancelledError:
            return ""

    async def _terminate_process(self, process: Any) -> None:
        pid = getattr(process, "pid", None)
        try:
            if os.name == "nt" and pid:
                await asyncio.to_thread(
                    subprocess.run,
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
            else:
                process.kill()
        except Exception as e:
            print(f"[Quirk] Failed to terminate process: {e}")

    async def _publish_status(
        self,
        task_id: str,
        title: str,
        status: str,
        *,
        started_at: int | None = None,
        ended_at: int | None = None,
        exit_code: int | None = None,
        output: str | None = None,
        error: str | None = None,
    ) -> None:
        payload = {
            "version": 1,
            "type": "quirk_antigravity_status",
            "taskId": task_id,
            "title": title,
            "status": status,
            "startedAt": started_at,
            "endedAt": ended_at,
            "exitCode": exit_code,
            "output": self._truncate(output) if output else None,
            "error": self._truncate(error) if error else None,
            "timestamp": self._now_ms(),
            # Compatibility with the previous frontend packet format.
            "task_id": task_id,
            "task": title,
        }
        await self._publish_payload(payload)

    async def _publish_log(self, task_id: str, title: str, stream: str, line: str) -> None:
        for chunk in self._chunk_line(self._clean_line(line)):
            if not chunk:
                continue
            payload = {
                "version": 1,
                "type": "quirk_antigravity_log",
                "taskId": task_id,
                "title": title,
                "stream": stream,
                "sequence": self._next_sequence(task_id),
                "line": chunk,
                "timestamp": self._now_ms(),
                # Compatibility with the previous frontend packet format.
                "task_id": task_id,
                "task": title,
                "log": chunk,
            }
            await self._publish_payload(payload)

    async def _publish_payload(self, payload: dict[str, Any]) -> None:
        room_obj = self._get_room()
        if not room_obj:
            print("[Quirk] Cannot publish packet: room is None")
            return
        if not hasattr(room_obj, "local_participant") or not room_obj.local_participant:
            print("[Quirk] Cannot publish packet: local_participant is missing")
            return

        encoded = json.dumps(payload, ensure_ascii=False)
        try:
            await room_obj.local_participant.publish_data(encoded, reliable=True, topic=QUIRK_TOPIC)
        except TypeError:
            await room_obj.local_participant.publish_data(encoded.encode("utf-8"), reliable=True)
        except Exception as pe:
            print(f"[Quirk] Failed to publish packet: {pe}")

    def _next_sequence(self, task_id: str) -> int:
        next_value = self._sequence_by_task.get(task_id, 0) + 1
        self._sequence_by_task[task_id] = next_value
        return next_value

    def _split_complete_lines(self, buffer: str) -> tuple[list[str], str]:
        normalized = buffer.replace("\r\n", "\n").replace("\r", "\n")
        parts = normalized.split("\n")
        if normalized.endswith("\n"):
            return parts[:-1], ""
        return parts[:-1], parts[-1]

    def _clean_line(self, line: str) -> str:
        without_ansi = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", line)
        without_controls = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", without_ansi)
        return without_controls.strip()

    def _chunk_line(self, line: str) -> list[str]:
        if len(line) <= MAX_PACKET_LINE_CHARS:
            return [line]
        return [line[idx : idx + MAX_PACKET_LINE_CHARS] for idx in range(0, len(line), MAX_PACKET_LINE_CHARS)]

    def _truncate(self, value: str | None) -> str | None:
        if value is None:
            return None
        return value[:MAX_SUMMARY_CHARS]

    def _now_ms(self) -> int:
        return int(time.time() * 1000)
