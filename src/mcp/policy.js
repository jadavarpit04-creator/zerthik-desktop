// Tool risk policy — mirrors the PRD's three levels:
//   Read                    → may run immediately (safe for context)
//   Write · approval req.   → nothing runs until the user approves the card
//   Destructive · blocked   → never run from Zerthik
//
// Classification prefers the server's own MCP tool annotations
// (readOnlyHint / destructiveHint). When a server does not annotate, we
// fall back to conservative name heuristics: obvious fetch-style verbs
// are Read, obvious destruction verbs are blocked, everything else is a
// Write that needs approval. When unsure, we always choose the safer level.

const READ_VERBS = ['get', 'list', 'search', 'read', 'fetch', 'query', 'find', 'show', 'view', 'lookup', 'describe', 'count', 'check', 'echo', 'ping', 'now', 'time', 'whoami', 'status'];
const DESTRUCTIVE_VERBS = ['delete', 'remove', 'destroy', 'drop', 'purge', 'wipe', 'truncate', 'revoke', 'terminate', 'kill'];

export const LEVELS = {
  read: { id: 'read', label: 'Read' },
  write: { id: 'write', label: 'Write · approval required' },
  destructive: { id: 'destructive', label: 'Destructive · blocked' },
};

export function classifyTool(tool) {
  const annotations = tool?.annotations || {};
  if (annotations.destructiveHint === true) return LEVELS.destructive;
  if (annotations.readOnlyHint === true) return LEVELS.read;
  const name = String(tool?.name || '').toLowerCase();
  const words = name.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => DESTRUCTIVE_VERBS.includes(w))) return LEVELS.destructive;
  if (words.some((w) => READ_VERBS.includes(w))) return LEVELS.read;
  return LEVELS.write;
}

// Map a protocol tool into the shape the UI renders everywhere.
export function decorateTool(tool) {
  const level = classifyTool(tool);
  return {
    name: tool.name,
    description: tool.description || '',
    inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    annotations: tool.annotations || {},
    levelId: level.id,
    level: level.label,
    discovered: true,
  };
}

// A starter JSON document for the tool runner, derived from inputSchema.
export function argsSkeleton(tool) {
  const props = tool?.inputSchema?.properties || {};
  const required = new Set(tool?.inputSchema?.required || []);
  const out = {};
  for (const [key, schema] of Object.entries(props)) {
    if (!required.has(key) && Object.keys(props).length > 4) continue;
    if (schema?.type === 'number' || schema?.type === 'integer') out[key] = 0;
    else if (schema?.type === 'boolean') out[key] = false;
    else if (schema?.type === 'array') out[key] = [];
    else if (schema?.type === 'object') out[key] = {};
    else out[key] = '';
  }
  return JSON.stringify(out, null, 2);
}
