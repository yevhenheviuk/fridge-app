// fridge-mcp worker — the whole server side of Наш Дім (Cloudflare Worker + D1).
//
//   /api/*             REST API for the PWA (api.js) — password login
//   /mcp/<MCP_TOKEN>   MCP server for Claude (mcp.js, tools/<feature>.js)
//   /push/*            daily Web Push (push.js)
//   cron "0 * * * *"   hourly push reminders
//
// Binding: DB (D1 "home"). Vars: VAPID_PUBLIC. Secrets: APP_PASSWORD, MCP_TOKEN, VAPID_PRIVATE.
import { handleApi } from './api.js';
import { handleMcp } from './mcp.js';
import { handlePush, hourlyPush } from './push.js';
import { migrateSupabase } from './migrate.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.allSettled([hourlyPush(env), migrateSupabase(env)]).then(rs =>
      rs.forEach(r => r.status === 'rejected' && console.error('cron', r.reason))));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      if (url.pathname.startsWith('/push/')) return await handlePush(request, env, url);
      if (env.MCP_TOKEN && url.pathname === `/mcp/${env.MCP_TOKEN}`) return await handleMcp(request, env);
      if (url.pathname === '/migrate-supabase') return Response.json(await migrateSupabase(env)); // one-time, idempotent
      return new Response('Not found', { status: 404 });
    } catch (e) {
      console.error(e);
      return Response.json({ error: e.message }, { status: 500 });
    }
  },
};
