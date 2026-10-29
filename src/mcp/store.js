// MCP session store — owns live client sessions and the persisted
// server registry. React state in App.jsx stays the UI source of truth;
// this module is the network + storage engine underneath it.
//
// Persistence: user-added servers and per-preset endpoint overrides are
// saved under `zerthik-mcp` in localStorage. Nothing connects on its
// own: connecting is always an explicit user action (PRD rule).

import { McpClient, resultToText } from './client.js';
import { decorateTool } from './policy.js';

const STORAGE_KEY = 'zerthik-mcp';
const sessions = new Map(); // serverId -> { client, serverInfo }

export function getSession(serverId) {
  return sessions.get(serverId) || null;
}

export function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Connect + discover. Returns { serverInfo, tools, resources } with
// tools already decorated with their policy level for the UI.
export async function connectServer(server) {
  await disconnectServer(server.id).catch(() => {});
  const client = McpClient.forServer(server);
  const { serverInfo } = await client.connect();
  const [tools, resources] = await Promise.all([
    client.listTools(),
    client.listResources(),
  ]);
  sessions.set(server.id, { client, serverInfo });
  return {
    serverInfo,
    tools: tools.map(decorateTool),
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.name || r.uri,
      description: r.description || '',
      mimeType: r.mimeType || '',
    })),
  };
}

export async function disconnectServer(serverId) {
  const session = sessions.get(serverId);
  if (!session) return;
  sessions.delete(serverId);
  await session.client.close();
}

export async function callServerTool(serverId, toolName, args) {
  const session = sessions.get(serverId);
  if (!session) throw new Error('This server is not connected.');
  const result = await session.client.callTool(toolName, args);
  return { result, text: resultToText(result), isError: Boolean(result?.isError) };
}

export async function readServerResource(serverId, uri) {
  const session = sessions.get(serverId);
  if (!session) throw new Error('This server is not connected.');
  const result = await session.client.readResource(uri);
  return { result, text: resultToText(result) };
}

// ---- persistence -----------------------------------------------------------

// Only durable config is stored — never live status or discovered tools.
function toStoredConfig(item) {
  return {
    id: item.id,
    name: item.name,
    detail: item.detail,
    category: item.category,
    authType: item.authType,
    scope: item.scope,
    transport: item.transport || 'http',
    serverUrl: item.serverUrl,
    command: item.command || '',
    argsText: item.argsText || '',
    headers: item.headers || '',
    apiKey: item.apiKey || '',
    domain: item.domain,
    custom: Boolean(item.custom),
  };
}

export function saveServers(items) {
  try {
    const custom = items.filter((item) => item.custom).map(toStoredConfig);
    const overrides = {};
    items.filter((item) => !item.custom).forEach((item) => {
      if (isValidHttpUrl(item.serverUrl) || item.command) overrides[item.id] = toStoredConfig(item);
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ custom, overrides }));
  } catch { /* storage unavailable — session-only mode */ }
}

export function loadServers(baseCatalog) {
  const withRuntime = (item) => ({
    ...item,
    transport: item.transport || 'http',
    status: 'idle',
    error: '',
    serverInfo: null,
    resources: [],
    connected: false,
    tools: (item.tools || []).map((tool) => ({ ...tool, discovered: false })),
  });
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return baseCatalog.map(withRuntime);
    const { custom = [], overrides = {} } = JSON.parse(raw);
    const merged = baseCatalog.map((item) => (
      overrides[item.id] ? { ...item, ...overrides[item.id], tools: item.tools } : item
    ));
    return [...custom.map(withRuntime), ...merged.map(withRuntime)];
  } catch {
    return baseCatalog.map(withRuntime);
  }
}
