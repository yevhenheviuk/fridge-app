// MCP server (JSON-RPC over Streamable HTTP, stateless).
// Tools come from tools/<feature>.js — each exports an array of
// { name, description, inputSchema, run(args, db, env) }.
import { db } from './lib/db.js';
import fridge from './tools/fridge.js';
import shopping from './tools/shopping.js';
import meals from './tools/meals.js';
import log from './tools/log.js';
import finance from './tools/finance.js';
import goals from './tools/goals.js';
import todo from './tools/todo.js';

const SERVER = { name: 'fridge-app', version: '2.0.0' };
const ALL = [...fridge, ...shopping, ...meals, ...log, ...finance, ...goals, ...todo];
const BY_NAME = Object.fromEntries(ALL.map(t => [t.name, t]));
const LIST = ALL.map(({ run, ...def }) => def);
const INSTRUCTIONS = 'Home app of Yevhen and Oleksandra (Sasha): fridge, shopping, meal plans, expenses, savings goals, todos. '
  + 'Dates are Europe/Brussels, money is euros. Everything is shared between the two; person ids "yevhen", "oleksandra" only matter for meal-plan kcal. '
  + 'Items with trig=true are trigger foods for Yevhen — only for Sasha. Never save a meal plan the user has not approved.';

async function handleRpc(msg, env) {
  const { id, method, params } = msg;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  if (id === undefined || id === null) return null; // notification
  switch (method) {
    case 'initialize':
      return ok({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: LIST });
    case 'tools/call': {
      const t = BY_NAME[params?.name];
      try {
        if (!t) throw new Error('Unknown tool: ' + params?.name);
        const out = await t.run(params.arguments || {}, db(env), env);
        return ok({ content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true });
      }
    }
    default: return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
  }
}

export async function handleMcp(request, env) {
  if (request.method === 'GET') {
    // MCP clients asking for an SSE stream: not supported (stateless server)
    if ((request.headers.get('accept') || '').includes('text/event-stream')) return new Response(null, { status: 405 });
    try { const rows = await db(env).rows('items'); return Response.json({ ok: true, items: rows.length, tools: LIST.length }); }
    catch (e) { return Response.json({ ok: false, error: e.message }, { status: 500 }); }
  }
  if (request.method === 'DELETE') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map(m => handleRpc(m, env)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0]);
}
