// Zerthik MCP client — a small, dependency-free Model Context Protocol
// client speaking JSON-RPC 2.0.
//
// Transports:
//  • HTTP  — the MCP "Streamable HTTP" transport: one POST per message,
//    `Mcp-Session-Id` captured on initialize, replies accepted as plain
//    JSON or as an SSE stream. Works from any web context (the server
//    must allow CORS, like every browser-facing API).
//  • stdio — local command transport, only inside the Tauri desktop
//    shell. The Rust side spawns the process and bridges lines over
//    Tauri commands/events (see src/native.js + src-tauri).
//
// The client implements the lifecycle Zerthik needs: initialize
// handshake, tools/list, tools/call, resources/list, resources/read, ping.

const PROTOCOL_VERSION = '2025-03-26';
const CLIENT_INFO = { name: 'Zerthik', version: '1.0.0' };
const REQUEST_TIMEOUT_MS = 20000;

export class McpError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'McpError';
    this.code = code;
  }
}

function parseSseMessages(text) {
  const messages = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data) continue;
    try { messages.push(JSON.parse(data)); } catch { /* ignore keep-alives */ }
  }
  return messages;
}

class HttpTransport {
  constructor({ url, headers = {} }) {
    this.url = url;
    this.headers = headers;
    this.sessionId = null;
  }

  async #post(payload, { expectResponse = true } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
          ...this.headers,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new McpError(`No response from ${this.url} within ${REQUEST_TIMEOUT_MS / 1000}s — is the server running?`);
      throw new McpError(`Could not reach ${this.url} (${error.message}). Check the URL and that the server allows browser (CORS) access.`);
    } finally {
      clearTimeout(timer);
    }

    const session = res.headers.get('mcp-session-id');
    if (session) this.sessionId = session;

    if (!expectResponse) return null; // notifications: 202 Accepted
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new McpError(`Server replied HTTP ${res.status}${body ? ` — ${body.slice(0, 160)}` : ''}`);
    }

    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (type.includes('text/event-stream')) {
      const messages = parseSseMessages(text);
      const match = messages.find((m) => m.id === payload.id) || messages.find((m) => m.result || m.error);
      if (!match) throw new McpError('Server sent an event stream without a response to our request.');
      return match;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new McpError('Server reply was not valid JSON — is this really an MCP endpoint?');
    }
  }

  request(payload) { return this.#post(payload); }
  notify(payload) { return this.#post(payload, { expectResponse: false }).catch(() => {}); }

  async close() {
    if (!this.sessionId) return;
    try {
      await fetch(this.url, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': this.sessionId, ...this.headers },
      });
    } catch { /* best effort */ }
    this.sessionId = null;
  }
}

// stdio transport — bridged to the Rust shell. Kept behind lazy imports of
// ../native.js so plain-web builds never touch Tauri APIs. Rust contract:
//   invoke('mcp_stdio_start', { command, args, env }) -> handle (string)
//   invoke('mcp_stdio_send', { handle, line })        -> ()
//   invoke('mcp_stdio_stop', { handle })              -> ()
//   event  'mcp-stdio-line'  { handle, line }         -> stdout lines
class StdioTransport {
  constructor({ command, args = [], env = {} }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.handle = null;
    this.pending = new Map();
    this.unlisten = null;
  }

  async start() {
    const native = await import('../native.js');
    if (!native.isTauri()) {
      throw new McpError('Command (stdio) servers run inside the Zerthik desktop app. In a browser, connect with a Remote URL instead.');
    }
    this.unlisten = await native.onMcpStdioLine(({ handle, line }) => {
      if (handle !== this.handle) return;
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve } = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolve(message);
      }
    });
    this.handle = await native.mcpStdioStart({ command: this.command, args: this.args, env: this.env });
  }

  async request(payload) {
    if (!this.handle) await this.start();
    const native = await import('../native.js');
    const result = new Promise((resolve, reject) => {
      this.pending.set(payload.id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(payload.id)) reject(new McpError(`The stdio server did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`));
      }, REQUEST_TIMEOUT_MS);
    });
    await native.mcpStdioSend({ handle: this.handle, line: JSON.stringify(payload) });
    return result;
  }

  async notify(payload) {
    if (!this.handle) return;
    const native = await import('../native.js');
    await native.mcpStdioSend({ handle: this.handle, line: JSON.stringify(payload) }).catch(() => {});
  }

  async close() {
    if (this.unlisten) { try { this.unlisten(); } catch { /* noop */ } this.unlisten = null; }
    if (!this.handle) return;
    const native = await import('../native.js');
    await native.mcpStdioStop({ handle: this.handle }).catch(() => {});
    this.handle = null;
    this.pending.clear();
  }
}

export class McpClient {
  constructor(transport) {
    this.transport = transport;
    this.nextId = 1;
    this.serverInfo = null;
    this.capabilities = {};
  }

  static forServer(server) {
    if (server.transport === 'stdio') {
      return new McpClient(new StdioTransport({
        command: server.command,
        args: server.args || [],
        env: server.env || {},
      }));
    }
    let headers = {};
    if (server.headers) {
      try { headers = JSON.parse(server.headers); } catch { headers = {}; }
    }
    if (server.authType === 'API key' && server.apiKey) {
      headers = { Authorization: `Bearer ${server.apiKey}`, ...headers };
    }
    return new McpClient(new HttpTransport({ url: server.serverUrl, headers }));
  }

  async #call(method, params) {
    const id = this.nextId++;
    const response = await this.transport.request({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    if (!response) throw new McpError(`Empty reply to ${method}.`);
    if (response.error) throw new McpError(response.error.message || `${method} failed`, response.error.code);
    return response.result;
  }

  async connect() {
    const result = await this.#call('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    this.serverInfo = result?.serverInfo || null;
    this.capabilities = result?.capabilities || {};
    await this.transport.notify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return { serverInfo: this.serverInfo, capabilities: this.capabilities, protocolVersion: result?.protocolVersion };
  }

  ping() { return this.#call('ping'); }

  async listTools() {
    const result = await this.#call('tools/list');
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  callTool(name, args = {}) {
    return this.#call('tools/call', { name, arguments: args });
  }

  async listResources() {
    if (!this.capabilities.resources) return [];
    const result = await this.#call('resources/list').catch(() => null);
    return Array.isArray(result?.resources) ? result.resources : [];
  }

  readResource(uri) {
    return this.#call('resources/read', { uri });
  }

  async close() {
    await this.transport.close().catch(() => {});
  }
}

// Flatten an MCP tool/resource result into readable text.
export function resultToText(result) {
  if (!result) return '';
  const parts = [];
  const push = (content) => {
    if (!content) return;
    if (typeof content === 'string') { parts.push(content); return; }
    if (content.type === 'text' && content.text) parts.push(content.text);
    else if (content.type === 'resource' && content.resource?.text) parts.push(content.resource.text);
    else if (content.text) parts.push(content.text);
    else parts.push(JSON.stringify(content, null, 2));
  };
  if (Array.isArray(result.content)) result.content.forEach(push);
  if (Array.isArray(result.contents)) result.contents.forEach(push);
  if (!parts.length && result.structuredContent) parts.push(JSON.stringify(result.structuredContent, null, 2));
  if (!parts.length) parts.push(JSON.stringify(result, null, 2));
  return parts.join('\n');
}
