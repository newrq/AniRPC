// Локальный мост: расширение не умеет в Discord IPC, поэтому
// background.js шлёт сюда activity по ws://127.0.0.1:47201,
// а этот процесс уже говорит с Discord через discord-rpc.
// Запуск: npm i && DISCORD_CLIENT_ID=xxx node server.js

const { WebSocketServer } = require('ws');
const RPC = require('discord-rpc');

const PORT = 47201;
const FALLBACK_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1558926718516076634';

let rpc = null;
let loggedInId = null;

// Логин (и перелогин при смене Client ID из popup)
async function ensureLogin(clientId) {
  const id = clientId || FALLBACK_CLIENT_ID;
  if (!id) { console.warn('[bridge] нет Client ID — создай приложение на discord.com/developers'); return null; }
  if (rpc && loggedInId === id) return rpc;
  try { await rpc?.destroy(); } catch {}
  rpc = new RPC.Client({ transport: 'ipc' });
  rpc.on('ready', () => console.log('[bridge] Discord готов как', rpc.user?.username));
  await rpc.login({ clientId: id });
  loggedInId = id;
  return rpc;
}

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
console.log(`[bridge] ws://127.0.0.1:${PORT}`);

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try {
      if (msg.type === 'CLEAR') {
        if (rpc) await rpc.clearActivity();
      }
      if (msg.type === 'SET_ACTIVITY') {
        const client = await ensureLogin(msg.clientId);
        if (!client) return;
        await client.setActivity(msg.activity || {});
        console.log('[bridge] activity:', msg.activity?.details, '|', msg.activity?.state);
      }
    } catch (e) {
      console.error('[bridge]', e.message);
    }
  });
});
