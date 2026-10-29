use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn summon_hotkey() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL), Code::Space)
}

/// Show the command card (and tell the UI to focus Search + read the
/// clipboard), or hide it again when it is already focused.
fn summon(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            let _ = window.emit("focus-search", ());
        }
    }
}

// ---------------------------------------------------------------------------
// MCP stdio transport
//
// Local MCP servers run as child processes speaking line-delimited
// JSON-RPC on stdin/stdout. The frontend owns the protocol; Rust only
// spawns processes, forwards lines in, and streams stdout lines back as
// `mcp-stdio-line` events tagged with the process handle.
// ---------------------------------------------------------------------------

struct McpProc {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
struct McpState(Mutex<HashMap<String, McpProc>>);

static MCP_COUNTER: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
fn mcp_stdio_start(
    app: tauri::AppHandle,
    state: State<'_, McpState>,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<String, String> {
    let mut child = Command::new(&command)
        .args(&args)
        .envs(env.iter())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start `{command}`: {error}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Server process has no stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Server process has no stdout".to_string())?;

    let handle = format!(
        "mcp-{}-{}",
        std::process::id(),
        MCP_COUNTER.fetch_add(1, Ordering::Relaxed)
    );

    let reader_app = app.clone();
    let reader_handle = handle.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(text) if !text.trim().is_empty() => {
                    let _ = reader_app.emit(
                        "mcp-stdio-line",
                        serde_json::json!({ "handle": reader_handle, "line": text }),
                    );
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    state
        .0
        .lock()
        .map_err(|_| "MCP state lock poisoned".to_string())?
        .insert(handle.clone(), McpProc { child, stdin });
    Ok(handle)
}

#[tauri::command]
fn mcp_stdio_send(state: State<'_, McpState>, handle: String, line: String) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "MCP state lock poisoned".to_string())?;
    let proc = guard
        .get_mut(&handle)
        .ok_or_else(|| "Unknown MCP process handle".to_string())?;
    proc.stdin
        .write_all(line.as_bytes())
        .and_then(|_| proc.stdin.write_all(b"\n"))
        .and_then(|_| proc.stdin.flush())
        .map_err(|error| format!("Could not write to MCP server: {error}"))
}

#[tauri::command]
fn mcp_stdio_stop(state: State<'_, McpState>, handle: String) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "MCP state lock poisoned".to_string())?;
    if let Some(mut proc) = guard.remove(&handle) {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(McpState::default())
        .invoke_handler(tauri::generate_handler![
            mcp_stdio_start,
            mcp_stdio_send,
            mcp_stdio_stop
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if *shortcut == summon_hotkey() && event.state() == ShortcutState::Pressed {
                        summon(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Best-effort: if another app already owns Ctrl+Space the app
            // still starts normally; the hotkey can be changed in Settings.
            let _ = app.global_shortcut().register(summon_hotkey());

            let open = MenuItem::with_id(app, "open", "Open Zerthik", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Zerthik", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Zerthik — Ctrl+Space")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => summon(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides to the tray; Quit lives in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Zerthik");
}
