// A tiny, dependency-free MCP server for testing Zerthik's MCP engine.
//
//   node tools/test-mcp-server.mjs        (listens on http://127.0.0.1:7421/mcp)
//
// Speaks MCP over Streamable HTTP with permissive CORS so the Zerthik
// web preview can connect. Exposes tools at all three policy levels:
//   echo / now / add   → Read (annotated readOnlyHint)
//   remember           → Write (no annotation → approval in Zerthik)
//   wipe_memory        → Destructive (annotated destructiveHint → blocked)
// plus one resource:  test://readme

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 7421;
let memory = [];

const TOOLS = [
  {
    name: 'echo',
    description: 'Echo back the message you send.',
    inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'Text to echo' } }, required: ['message'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'now',
    description: 'Current server date and time (ISO).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add',
    description: 'Add two numbers.',
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'remember',
    description: 'Store a note in server memory (a write action).',
    inputSchema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
  },
  {
    name: 'wipe_memory',
    description: 'Delete every stored note (destructive).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { destructiveHint: true },
  },
];

function callTool(name, args = {}) {
  switch (name) {
    case 'echo': return `Echo: ${args.message ?? ''}`;
    case 'now': return new Date().toISOString();
    case 'add': return `${Number(args.a) || 0} + ${Number(args.b) || 0} = ${(Number(args.a) || 0) + (Number(args.b) || 0)}`;
    case 'remember':
      memory.push(String(args.note || ''));
      return `Stored. Memory now holds ${memory.length} note(s).`;
    case 'wipe_memory':
      memory = [];
      return 'Memory wiped.';
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function handle(message) {
  const { id, method, params } = message;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'Zerthik Test Server', version: '1.0.0' },
      });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        const text = callTool(params?.name, params?.arguments || {});
        return ok({ content: [{ type: 'text', text }] });
      } catch (error) {
        return ok({ content: [{ type: 'text', text: error.message }], isError: true });
      }
    }
    case 'resources/list':
      return ok({ resources: [{ uri: 'test://readme', name: 'Test server readme', description: 'About this test server', mimeType: 'text/plain' }] });
    case 'resources/read':
      if (params?.uri === 'test://readme') {
        return ok({ contents: [{ uri: 'test://readme', mimeType: 'text/plain', text: `Zerthik Test MCP Server\nTools: ${TOOLS.map((t) => t.name).join(', ')}\nNotes in memory: ${memory.length}` }] });
      }
      return { jsonrpc: '2.0', id, error: { code: -32002, message: `Resource not found: ${params?.uri}` } };
    default:
      return id === undefined ? null : { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('Zerthik Test MCP Server — POST JSON-RPC to /mcp\n');
  }
  if (req.method === 'DELETE') { res.writeHead(200); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }

  let body = '';
  for await (const chunk of req) body += chunk;
  let message;
  try { message = JSON.parse(body); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
  }

  const isNotification = message.id === undefined;
  if (message.method === 'initialize') res.setHeader('Mcp-Session-Id', randomUUID());
  const response = handle(message);
  if (isNotification || !response) { res.writeHead(202); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify(response));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Zerthik Test MCP Server listening on http://127.0.0.1:${PORT}/mcp`);
});
