// fridge-mcp worker — the app's server side (Cloudflare Worker, no dependencies).
//
//   /mcp/<MCP_TOKEN>   MCP server for Claude (tools: worker/tools/<feature>.js)
//   /push/*            daily Web Push (push.js)
//   /tg/*              Telegram bot (telegram.js)
//   cron "0 * * * *"   hourly: push reminders + Telegram digests
//
// Variables (Cloudflare → Worker → Settings → Variables and Secrets):
//   SUPABASE_URL, USER_ID, VAPID_PUBLIC, APP_URL (optional)
//   secrets: SUPABASE_KEY, MCP_TOKEN, VAPID_PRIVATE, BOT_TOKEN
import { handleMcp } from './mcp.js';
import { handlePush, hourlyPush } from './push.js';
import { handleTelegram, telegramHourly } from './telegram.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.allSettled([hourlyPush(env), telegramHourly(env)]).then(rs =>
      rs.forEach(r => r.status === 'rejected' && console.error('cron', r.reason))));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/push/')) return await handlePush(request, env, url);
      if (url.pathname.startsWith('/tg/')) return await handleTelegram(request, env, url, ctx);
      if (env.MCP_TOKEN && url.pathname === `/mcp/${env.MCP_TOKEN}`) return await handleMcp(request, env);
      return new Response('Not found', { status: 404 });
    } catch (e) {
      console.error(e);
      return Response.json({ error: e.message }, { status: 500 });
    }
  },
};
