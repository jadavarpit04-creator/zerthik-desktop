// Native bridge for the Tauri shell.
// Every function is a safe no-op / web fallback when the app runs in a
// plain browser (marketing live demo, Vite preview), so one frontend
// serves both the native app and the web.
export function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function readClipboardText() {
  if (!isTauri()) return null;
  try {
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
    return (await readText()) || null;
  } catch {
    return null;
  }
}

export async function writeClipboardText(text) {
  if (isTauri()) {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return true;
    } catch {
      // fall through to the web clipboard below
    }
  }
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function openExternal(url) {
  if (isTauri()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {
      // fall through
    }
  }
  window.open(url, '_blank', 'noopener');
}

// ---- MCP stdio transport (desktop only) ----------------------------------
// Local MCP servers are spawned by the Rust shell; the frontend speaks
// line-delimited JSON-RPC to them through these commands. In a plain
// browser these reject, and the MCP client explains that command
// servers need the desktop app.
async function tauriInvoke(command, args) {
  if (!isTauri()) throw new Error('Not running inside the Tauri shell');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

export function mcpStdioStart({ command, args = [], env = {} }) {
  return tauriInvoke('mcp_stdio_start', { command, args, env });
}

export function mcpStdioSend({ handle, line }) {
  return tauriInvoke('mcp_stdio_send', { handle, line });
}

export function mcpStdioStop({ handle }) {
  return tauriInvoke('mcp_stdio_stop', { handle });
}

export async function onMcpStdioLine(callback) {
  if (!isTauri()) return null;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen('mcp-stdio-line', (event) => callback(event.payload));
  } catch {
    return null;
  }
}

// Fired by the Rust global-shortcut handler when the window is summoned.
export async function onFocusSearch(callback) {
  if (!isTauri()) return null;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen('focus-search', callback);
  } catch {
    return null;
  }
}
