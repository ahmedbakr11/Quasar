# Luna Delegation Architecture

## Purpose

Luna should not be designed as one giant realtime model that directly performs every possible task. Gemini Live is good for low-latency conversation, voice interaction, quick reasoning, and tool calling, but it is not the right place to do every heavy or long-running job.

The better design is to make Luna the front-facing orchestrator. Luna talks to the user, understands intent, asks clarifying questions, chooses the right tool or worker, delegates the task, tracks progress, and returns the result.

This document describes the recommended approach for making Luna capable of broader work such as document analysis, report writing, code tasks, file generation, research, data processing, Google Workspace actions, and future model-specific workflows.

## Core Principle

Luna should be the conversational controller, not the only executor.

Responsibilities should be split like this:

- Luna realtime agent: conversation, planning, clarification, tool selection, progress updates, final response.
- Worker/executor layer: heavy reasoning, document processing, file generation, long-running jobs, model-specific work.
- Artifact/job system: stores outputs, tracks progress, and gives Luna reliable status/result data.

This keeps the live experience fast while still allowing Luna to use stronger or more specialized models when needed.

## Example User Requests

The report-from-PDF case is only one example. The same architecture should support many task types:

- "Read this PDF and write the assigned report."
- "Analyze this folder and summarize the project structure."
- "Use Claude to reason through this long document."
- "Generate a spreadsheet from these notes."
- "Create a presentation from this outline."
- "Look at these files and tell me what needs fixing."
- "Research this topic and save the findings."
- "Draft an email based on this document."
- "Convert this data into a CSV."
- "Run a coding task and give me the changed files."

The important abstraction is not `generate_report`. The important abstraction is `delegate_task`.

## Recommended Architecture

### 1. Luna Realtime Agent

Luna remains the user-facing LiveKit/Gemini Live agent.

Main responsibilities:

- Handle voice/chat interaction.
- Understand the user's goal.
- Ask clarifying questions when needed.
- Choose whether a simple answer is enough or whether a task must be delegated.
- Call tools exposed through the LiveKit agent runtime.
- Report progress and final results naturally.

Current project fit:

- Luna already lives in `Luna_Agent/agent.py`.
- The project already uses LiveKit tools through `llm.Toolset`.
- Existing examples include system/file tools, task tools, and Google Workspace MCP integration.

This means the project already has the right foundation. We do not need to replace Luna's runtime to add this capability.

### 2. Tool Router

Add a small routing layer inside Luna's Python agent service.

The router receives a general task request and decides how to execute it.

Potential interface:

```python
await delegate_task(
    task_type="document_analysis",
    instructions="Read this PDF and write the assigned report.",
    inputs=["D:/path/task.pdf"],
    preferred_model="auto",
    output_format="docx"
)
```

The router should normalize requests into a structured internal job payload:

```json
{
  "task_type": "document_analysis",
  "instructions": "Read this PDF and write the assigned report.",
  "inputs": ["D:/path/task.pdf"],
  "preferred_model": "auto",
  "output_format": "docx",
  "priority": "normal"
}
```

The router can then pick a suitable executor.

Example routing logic:

- `document_analysis` -> document worker using Gemini, OpenAI, Claude, or local PDF extraction.
- `code_task` -> coding worker or CLI-backed agent.
- `research` -> browser/search-capable worker.
- `workspace_action` -> Google Workspace MCP tools.
- `file_transform` -> local Python scripts.
- `data_analysis` -> Python/pandas worker.
- `creative_generation` -> image/audio/document generation tools.

### 3. Worker Executors

Workers do the actual heavy work.

Possible worker types:

- Gemini worker: uses `google-genai` non-live models for text, image, PDF, and document-capable tasks.
- OpenAI worker: uses OpenAI models for reasoning, coding, structured generation, and file-aware tasks.
- Claude worker: useful for long documents, careful writing, and high-context analysis.
- Local script worker: uses Python libraries for deterministic tasks like PDF extraction, CSV generation, DOCX generation, and filesystem operations.
- OpenClaw worker: optional future integration if we want to use OpenClaw as one executor behind Luna.
- MCP worker: uses MCP servers for Google Workspace, browser tools, file systems, or other services.

Workers should return structured results, not just raw text.

Example result:

```json
{
  "status": "completed",
  "summary": "Generated a report from the uploaded task PDF.",
  "outputs": [
    "D:/Projects/Quasar/generated/reports/task-report.docx"
  ],
  "warnings": [],
  "model_used": "gemini"
}
```

### 4. Job System

Some delegated tasks will take longer than a normal realtime response. Luna needs a way to track them.

Minimum viable version:

- Run the task synchronously.
- Return a result or error.
- Use this for quick jobs only.

Better version:

- Create a SQLite-backed job table.
- Run the worker in the background.
- Give Luna a job ID.
- Let Luna check status.
- Store outputs as artifacts.

Recommended job states:

- `queued`
- `running`
- `needs_input`
- `completed`
- `failed`
- `cancelled`

Useful tools for Luna:

```python
delegate_task(...)
check_job_status(job_id)
list_recent_jobs()
cancel_job(job_id)
open_artifact(path)
```

### 5. Artifact System

Workers should save durable outputs instead of only returning text in the chat.

Artifact examples:

- Markdown report
- DOCX document
- PDF export
- CSV file
- JSON file
- generated image
- code patch
- summarized notes
- extracted document text

Suggested local folder structure:

```text
Quasar/
  generated/
    reports/
    documents/
    data/
    images/
    jobs/
```

For production, app-data storage is probably better than the repo folder. During development, a `generated/` folder is simple and visible.

Each job can create a metadata file:

```json
{
  "job_id": "job_123",
  "created_at": "2026-05-17T10:30:00Z",
  "task_type": "document_analysis",
  "status": "completed",
  "inputs": ["D:/path/task.pdf"],
  "outputs": ["generated/reports/report.docx"],
  "model_used": "claude"
}
```

## Model Routing

Luna should support a `preferred_model` field, but should also have an `auto` mode.

Example values:

- `auto`
- `gemini`
- `openai`
- `claude`
- `local`
- `openclaw`

`auto` should choose based on task type and available credentials.

Possible routing rules:

- Fast simple text -> Gemini or current Luna response.
- PDF/document analysis -> Gemini non-live, Claude, or OpenAI depending on configured provider.
- Long careful writing -> Claude or GPT class model.
- Structured JSON extraction -> OpenAI/Gemini with schema validation.
- Google Workspace actions -> existing Google Workspace MCP.
- Local file conversion -> Python script worker.
- Coding tasks -> dedicated coding executor.

This avoids hardcoding Luna to one model or one vendor.

## Can This Work Without Another Provider?

Yes.

The first version can stay Google-only:

- Luna uses Gemini Live for conversation.
- Delegated workers use normal Gemini models through `google-genai`.
- PDF/document handling happens in the worker, not inside the realtime live session.

This is still a multi-model architecture in practice, but it can use the same provider and API key.

The key distinction is:

- Gemini Live: realtime voice/chat orchestration.
- Gemini non-live: heavy document/file/reasoning work.

That is cleaner than trying to force Gemini Live to directly process and generate all files.

## OpenClaw's Role

OpenClaw may be useful later, but it should not be the first dependency unless we specifically want its broader runtime.

Potential benefits:

- Model-agnostic workflows.
- Multi-agent routing.
- PDF/document tools.
- Skills/workspaces.
- External agent execution model.

Risks for this project:

- Adds another runtime to maintain.
- Adds another state/configuration layer.
- Adds another security surface.
- Requires bridging Luna, Quasar, LiveKit, and OpenClaw cleanly.
- May overlap with tools the project already has.

Recommended integration strategy:

Do not make OpenClaw the center of Luna.

Instead, if we use it later, expose it as one executor behind the same delegation interface:

```python
delegate_task(..., executor="openclaw")
```

This keeps Quasar's architecture stable. Luna does not need to know whether a task was handled by Gemini, Claude, OpenAI, OpenClaw, or a local script.

## Minimal First Version

The first implementation should be small and practical.

Build:

- `DelegationTools` or `WorkerTools` in `Luna_Agent/agent.py`.
- `delegate_task` tool with structured parameters.
- A Gemini non-live worker using `google-genai`.
- Local file input support.
- Markdown output support.
- A `generated/` output folder.
- Basic error handling and result summaries.

Initial supported task types:

- `general`
- `document_analysis`
- `file_summary`
- `writing`

Initial output formats:

- `text`
- `markdown`

This gives Luna useful delegation without overengineering.

## Next Iteration

After the first version works, add:

- DOCX generation using `python-docx`.
- PDF text extraction fallback using `pypdf` or `pymupdf`.
- SQLite job tracking.
- `check_job_status` tool.
- output artifact metadata.
- provider abstraction for OpenAI and Claude.
- UI page for delegated jobs and generated artifacts.

## Future Advanced Version

Long-term Luna can have a full executor system:

```text
User
  -> Luna Gemini Live Agent
    -> Delegation Tool Router
      -> Job Manager
        -> Gemini Worker
        -> OpenAI Worker
        -> Claude Worker
        -> Local Python Worker
        -> MCP Worker
        -> OpenClaw Worker
      -> Artifact Store
    -> Luna returns progress/result to user
```

This turns Luna into a real assistant platform instead of a single-model chat wrapper.

## Suggested Tool Interfaces

### delegate_task

General-purpose delegation for broad work.

```python
async def delegate_task(
    task_type: str,
    instructions: str,
    inputs_json: str = "[]",
    preferred_model: str = "auto",
    output_format: str = "markdown"
) -> str:
    ...
```

### analyze_files

Focused file/folder analysis.

```python
async def analyze_files(
    paths_json: str,
    question: str,
    preferred_model: str = "auto"
) -> str:
    ...
```

### create_artifact

Create files from generated content.

```python
async def create_artifact(
    title: str,
    content: str,
    output_format: str = "markdown"
) -> str:
    ...
```

### check_job_status

Poll background work.

```python
async def check_job_status(job_id: str) -> str:
    ...
```

## Security Notes

Delegation tools are powerful and need boundaries.

Important controls:

- Restrict file access to allowed directories by default.
- Avoid arbitrary shell execution for delegated tasks unless explicitly required.
- Do not expose secrets in prompts or generated artifacts.
- Keep API keys in environment variables, not source files.
- Rotate any secrets that were committed or shared.
- Log job metadata without logging sensitive full document contents unless needed.
- Require confirmation before destructive file operations, sending emails, or modifying external services.

Current repo note:

`Luna_Agent/.env` contains real-looking API/OAuth secrets. If this repo was ever committed, uploaded, or shared, those credentials should be rotated before adding more powerful delegation capabilities.

## Recommended Decision

Build a Quasar-native delegation layer first.

Do not start by replacing Luna with OpenClaw or another full agent runtime. The current LiveKit/Gemini setup already supports tools, so the cleanest path is to add a small, well-defined worker system behind Luna.

Use OpenClaw later only if it proves useful as an executor, not as the foundation of the whole Luna architecture.

## Implementation Roadmap

### Phase 1: Native Delegation MVP

- Add `DelegationTools` to `Luna_Agent/agent.py`.
- Add a `delegate_task` tool.
- Add Gemini non-live worker calls using `google-genai`.
- Support text/markdown outputs.
- Save artifacts to `generated/`.
- Return structured JSON to Luna.

### Phase 2: Document and Artifact Support

- Add PDF extraction fallback.
- Add DOCX generation.
- Add artifact metadata files.
- Add stronger path validation.
- Add better error messages for missing files or unsupported formats.

### Phase 3: Background Jobs

- Add jobs table or job metadata store.
- Add background execution.
- Add `check_job_status` and `list_recent_jobs`.
- Add cancellation where possible.

### Phase 4: Multi-Provider Model Routing

- Add provider interface.
- Add OpenAI worker.
- Add Claude worker.
- Add model selection policy.
- Add config UI for provider keys and preferred defaults.

### Phase 5: UI Integration

- Add a Quasar page for jobs/artifacts.
- Show status, outputs, timestamps, and model used.
- Let the user open generated files from the app.
- Let Luna reference existing jobs and artifacts in conversation.

## Bottom Line

Luna should become an orchestrator with delegation powers.

Gemini Live should remain the natural interface. Heavy work should go to specialized workers that can use Gemini non-live, OpenAI, Claude, local scripts, MCP tools, or OpenClaw later.

This design keeps Luna fast, extensible, and vendor-flexible while fitting the current Quasar codebase.
