use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::db::{connection, AppState};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskSubtask {
    pub id: String,
    pub text: String,
    pub done: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub due_date: String,
    pub priority: String,
    pub subtasks: Vec<TaskSubtask>,
    pub status: String,
    pub color_token: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskListItem {
    pub id: String,
    pub name: String,
    pub color_token: String,
    pub position: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatePayload {
    pub tasks: Vec<TaskItem>,
    pub lists: Vec<TaskListItem>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskPayload {
    pub title: String,
    pub description: String,
    pub due_date: String,
    pub priority: String,
    pub status: String,
    pub subtasks: Vec<String>,
    pub color_token: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskPayload {
    pub title: Option<String>,
    pub description: Option<String>,
    pub due_date: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub color_token: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveTaskPayload {
    pub to_status: String,
    pub to_index: i64,
}

fn validate_session(conn: &Connection, token: &str) -> Result<String, String> {
    let now = Utc::now().to_rfc3339();
    conn.query_row(
        "SELECT user_id FROM sessions WHERE id = ?1 AND expires_at > ?2",
        params![token, now],
        |row| row.get(0),
    )
    .map_err(|_| "Invalid or expired session".to_string())
}

fn assert_status(status: &str) -> Result<(), String> {
    if matches!(status, "todo" | "in_progress" | "done") {
        Ok(())
    } else {
        Err("Invalid task status".to_string())
    }
}

fn assert_priority(priority: &str) -> Result<(), String> {
    if matches!(priority, "high" | "medium" | "low") {
        Ok(())
    } else {
        Err("Invalid task priority".to_string())
    }
}

fn ensure_default_lists(conn: &Connection, user_id: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let defaults = [
        ("todo", "Todo", "slate", 0_i64),
        ("in_progress", "In Progress", "sky", 1_i64),
        ("done", "Done", "emerald", 2_i64),
    ];
    for (status, name, color, position) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO task_lists (user_id, status, name, color_token, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![user_id, status, name, color, position, now],
        )
        .map_err(|e| format!("Failed to initialize task lists: {e}"))?;
    }
    Ok(())
}

fn load_subtasks(conn: &Connection, task_id: &str) -> Result<Vec<TaskSubtask>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, text, done
             FROM task_subtasks
             WHERE task_id = ?1
             ORDER BY position ASC",
        )
        .map_err(|e| format!("Failed to prepare subtask query: {e}"))?;
    let mut rows = stmt
        .query(params![task_id])
        .map_err(|e| format!("Failed to query subtasks: {e}"))?;
    let mut out = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to read subtask row: {e}"))?
    {
        let done_i: i64 = row.get(2).map_err(|e| format!("Invalid subtask row: {e}"))?;
        out.push(TaskSubtask {
            id: row.get(0).map_err(|e| format!("Invalid subtask row: {e}"))?,
            text: row.get(1).map_err(|e| format!("Invalid subtask row: {e}"))?,
            done: done_i == 1,
        });
    }
    Ok(out)
}

fn load_task(conn: &Connection, user_id: &str, task_id: &str) -> Result<TaskItem, String> {
    let row = conn
        .query_row(
            "SELECT id, title, description, due_date, priority, status, color_token, position, created_at, updated_at
             FROM tasks
             WHERE id = ?1 AND user_id = ?2",
            params![task_id, user_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                ))
            },
        )
        .map_err(|_| "Task not found".to_string())?;

    Ok(TaskItem {
        id: row.0,
        title: row.1,
        description: row.2,
        due_date: row.3,
        priority: row.4,
        subtasks: load_subtasks(conn, task_id)?,
        status: row.5,
        color_token: row.6,
        position: row.7,
        created_at: row.8,
        updated_at: row.9,
    })
}

fn normalize_positions(conn: &Connection, user_id: &str, status: &str) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id FROM tasks WHERE user_id = ?1 AND status = ?2 ORDER BY position ASC, updated_at ASC",
        )
        .map_err(|e| format!("Failed to prepare normalization query: {e}"))?;
    let ids = stmt
        .query_map(params![user_id, status], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to normalize positions: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to normalize positions: {e}"))?;
    for (idx, id) in ids.into_iter().enumerate() {
        conn.execute(
            "UPDATE tasks SET position = ?1 WHERE id = ?2",
            params![idx as i64, id],
        )
        .map_err(|e| format!("Failed to normalize positions: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_tasks(state: State<AppState>, session_token: String) -> Result<TaskStatePayload, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    ensure_default_lists(&conn, &user_id)?;

    let mut list_stmt = conn
        .prepare(
            "SELECT status, name, color_token, position
             FROM task_lists
             WHERE user_id = ?1
             ORDER BY position ASC",
        )
        .map_err(|e| format!("Failed to prepare list query: {e}"))?;
    let lists = list_stmt
        .query_map(params![user_id], |row| {
            Ok(TaskListItem {
                id: row.get(0)?,
                name: row.get(1)?,
                color_token: row.get(2)?,
                position: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query task lists: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to parse task lists: {e}"))?;

    let mut task_stmt = conn
        .prepare(
            "SELECT id, title, description, due_date, priority, status, color_token, position, created_at, updated_at
             FROM tasks
             WHERE user_id = ?1
             ORDER BY updated_at ASC",
        )
        .map_err(|e| format!("Failed to prepare task query: {e}"))?;
    let rows = task_stmt
        .query_map(params![&user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
            ))
        })
        .map_err(|e| format!("Failed to query tasks: {e}"))?;

    let mut tasks = Vec::new();
    for row in rows {
        let row = row.map_err(|e| format!("Failed to parse task row: {e}"))?;
        tasks.push(TaskItem {
            id: row.0.clone(),
            title: row.1,
            description: row.2,
            due_date: row.3,
            priority: row.4,
            subtasks: load_subtasks(&conn, &row.0)?,
            status: row.5,
            color_token: row.6,
            position: row.7,
            created_at: row.8,
            updated_at: row.9,
        });
    }

    Ok(TaskStatePayload { tasks, lists })
}

#[tauri::command]
pub fn create_task(
    state: State<AppState>,
    session_token: String,
    payload: CreateTaskPayload,
) -> Result<TaskItem, String> {
    assert_status(&payload.status)?;
    assert_priority(&payload.priority)?;
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("Task title is required".to_string());
    }
    let due_date = payload.due_date.trim();

    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    ensure_default_lists(&conn, &user_id)?;

    let now = Utc::now().to_rfc3339();
    let task_id = Uuid::new_v4().to_string();
    let next_pos: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE user_id = ?1 AND status = ?2",
            params![&user_id, payload.status.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate task position: {e}"))?;

    conn.execute(
        "INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, color_token, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        params![
            task_id,
            user_id,
            title,
            payload.description.trim(),
            due_date,
            payload.priority,
            payload.status,
            payload.color_token.trim(),
            next_pos,
            now
        ],
    )
    .map_err(|e| format!("Failed to create task: {e}"))?;

    for (idx, text) in payload.subtasks.iter().enumerate() {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT INTO task_subtasks (id, task_id, text, done, position) VALUES (?1, ?2, ?3, 0, ?4)",
            params![Uuid::new_v4().to_string(), task_id, trimmed, idx as i64],
        )
        .map_err(|e| format!("Failed to create subtask: {e}"))?;
    }

    load_task(&conn, &validate_session(&conn, &session_token)?, &task_id)
}

#[tauri::command]
pub fn update_task(
    state: State<AppState>,
    session_token: String,
    task_id: String,
    patch: UpdateTaskPayload,
) -> Result<TaskItem, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;

    let existing = conn
        .query_row(
            "SELECT status, title, description, due_date, priority, color_token FROM tasks WHERE id = ?1 AND user_id = ?2",
            params![&task_id, &user_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Failed to load task: {e}"))?
        .ok_or_else(|| "Task not found".to_string())?;

    let next_status = patch.status.clone().unwrap_or(existing.0.clone());
    assert_status(&next_status)?;
    let next_priority = patch.priority.clone().unwrap_or(existing.4.clone());
    assert_priority(&next_priority)?;
    let next_title = patch.title.clone().unwrap_or(existing.1.clone()).trim().to_string();
    if next_title.is_empty() {
        return Err("Task title is required".to_string());
    }
    let next_due = patch.due_date.clone().unwrap_or(existing.3.clone()).trim().to_string();

    let now = Utc::now().to_rfc3339();
    let mut next_position: i64 = conn
        .query_row(
            "SELECT position FROM tasks WHERE id = ?1 AND user_id = ?2",
            params![&task_id, &user_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to load task position: {e}"))?;
    if next_status != existing.0 {
        next_position = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE user_id = ?1 AND status = ?2",
                params![&user_id, &next_status],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to calculate destination position: {e}"))?;
    }

    conn.execute(
        "UPDATE tasks
         SET title = ?1, description = ?2, due_date = ?3, priority = ?4, status = ?5, color_token = ?6, position = ?7, updated_at = ?8
         WHERE id = ?9 AND user_id = ?10",
        params![
            next_title,
            patch.description.clone().unwrap_or(existing.2).trim().to_string(),
            next_due,
            next_priority,
            next_status,
            patch.color_token.clone().unwrap_or(existing.5).trim().to_string(),
            next_position,
            now,
            &task_id,
            &user_id,
        ],
    )
    .map_err(|e| format!("Failed to update task: {e}"))?;

    normalize_positions(&conn, &user_id, &existing.0)?;
    normalize_positions(&conn, &user_id, &next_status)?;
    load_task(&conn, &user_id, &task_id)
}

#[tauri::command]
pub fn move_task(
    state: State<AppState>,
    session_token: String,
    task_id: String,
    payload: MoveTaskPayload,
) -> Result<TaskItem, String> {
    assert_status(&payload.to_status)?;
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;

    let source_status: String = conn
        .query_row(
            "SELECT status FROM tasks WHERE id = ?1 AND user_id = ?2",
            params![&task_id, &user_id],
            |row| row.get(0),
        )
        .map_err(|_| "Task not found".to_string())?;

    // 1. Temporarily isolate the task from ordering
    conn.execute(
        "UPDATE tasks SET status = 'temp_moving', position = -1 WHERE id = ?1 AND user_id = ?2",
        params![&task_id, &user_id],
    )
    .map_err(|e| format!("Failed to isolate task: {e}"))?;

    // 2. Normalize source list (closes the gap)
    normalize_positions(&conn, &user_id, &source_status)?;

    // 3. Normalize destination list (ensures consecutive indices 0, 1, 2...)
    normalize_positions(&conn, &user_id, &payload.to_status)?;

    // 4. Calculate bounded destination index
    let destination_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE user_id = ?1 AND status = ?2",
            params![&user_id, &payload.to_status],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count destination: {e}"))?;
    let bounded_index = payload.to_index.max(0).min(destination_count);

    // 5. Shift items in destination list to make room
    conn.execute(
        "UPDATE tasks 
         SET position = position + 1 
         WHERE user_id = ?1 AND status = ?2 AND position >= ?3",
        params![&user_id, &payload.to_status, &bounded_index],
    )
    .map_err(|e| format!("Failed to shift tasks: {e}"))?;

    // 6. Place the task at the destination
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE tasks SET status = ?1, position = ?2, updated_at = ?3 WHERE id = ?4 AND user_id = ?5",
        params![&payload.to_status, &bounded_index, now, &task_id, &user_id],
    )
    .map_err(|e| format!("Failed to place task: {e}"))?;

    // 7. Finally, normalize positions of destination list to ensure clean numbers
    normalize_positions(&conn, &user_id, &payload.to_status)?;

    load_task(&conn, &user_id, &task_id)
}

#[tauri::command]
pub fn toggle_subtask(
    state: State<AppState>,
    session_token: String,
    task_id: String,
    subtask_id: String,
) -> Result<TaskItem, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;

    let owns_task: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE id = ?1 AND user_id = ?2",
            params![&task_id, &user_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to load task: {e}"))?;
    if owns_task == 0 {
        return Err("Task not found".to_string());
    }

    conn.execute(
        "UPDATE task_subtasks
         SET done = CASE done WHEN 1 THEN 0 ELSE 1 END
         WHERE id = ?1 AND task_id = ?2",
        params![&subtask_id, &task_id],
    )
    .map_err(|e| format!("Failed to toggle subtask: {e}"))?;
    conn.execute(
        "UPDATE tasks SET updated_at = ?1 WHERE id = ?2",
        params![Utc::now().to_rfc3339(), &task_id],
    )
    .map_err(|e| format!("Failed to update task timestamp: {e}"))?;

    load_task(&conn, &user_id, &task_id)
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, session_token: String, task_id: String) -> Result<(), String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;

    let status: String = conn
        .query_row(
            "SELECT status FROM tasks WHERE id = ?1 AND user_id = ?2",
            params![&task_id, &user_id],
            |row| row.get(0),
        )
        .map_err(|_| "Task not found".to_string())?;

    conn.execute("DELETE FROM task_subtasks WHERE task_id = ?1", params![&task_id])
        .map_err(|e| format!("Failed to delete task subtasks: {e}"))?;
    conn.execute(
        "DELETE FROM tasks WHERE id = ?1 AND user_id = ?2",
        params![&task_id, &user_id],
    )
    .map_err(|e| format!("Failed to delete task: {e}"))?;
    normalize_positions(&conn, &user_id, &status)?;
    Ok(())
}

#[tauri::command]
pub fn set_list_color(
    state: State<AppState>,
    session_token: String,
    list_id: String,
    color_token: String,
) -> Result<(), String> {
    assert_status(&list_id)?;
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    ensure_default_lists(&conn, &user_id)?;
    conn.execute(
        "UPDATE task_lists SET color_token = ?1, updated_at = ?2 WHERE user_id = ?3 AND status = ?4",
        params![color_token.trim(), Utc::now().to_rfc3339(), user_id, list_id],
    )
    .map_err(|e| format!("Failed to set list color: {e}"))?;
    Ok(())
}
