// AniRPC: окно приложения + слежка за историей Chrome/Edge + прямой Discord RPC.
// Пользователь смотрит в СВОЁМ браузере: берём последний URL 6 сайтов из истории,
// сами фетчим страницу и парсим title/серию/постер. Встроенного браузера нет.
// Теряем только прогресс-бар и паузу (плеер нам недоступен) — честный shortcut.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const RPC = require('discord-rpc');
let initSqlJs = null;
try { initSqlJs = require('sql.js'); } catch {} // без sql.js слежка молча стоит

const APP_ID = '1558926718516076634'; // вшит: пользователю ничего настраивать не надо
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36';
const SITE_LABELS = {
  yummyani: 'YummyAnime (ru)', yummyanime: 'YummyAnime', animego: 'AnimeGO',
  jutsu: 'Jut.su', hianime: 'HiAnime', miruro: 'Miruro'
};
const HISTORY_FILES = [
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data/Default/History'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/User Data/Default/History'),
  path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/User Data/Default/History')
];
const DEFAULTS = {
  enabled: true, lang: 'ru',
  sites: { yummyani: true, yummyanime: true, animego: true, jutsu: true, hianime: true, miruro: true }
};

let win = null;
let settings = loadSettings();
let presence = null, lastSentJson = '', lastUrl = '';
let rpc = null, connected = false, lastRpcError = '', connecting = false, pendingPush = false;

// --- настройки: plain JSON, без зависимостей ---
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    return { ...DEFAULTS, ...raw, sites: { ...DEFAULTS.sites, ...(raw.sites || {}) } };
  } catch { return { ...DEFAULTS, sites: { ...DEFAULTS.sites } }; }
}
function saveSettings() {
  try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings)); } catch {}
}

// --- Discord RPC напрямую через IPC десктоп-клиента ---
async function ensureRpc() {
  if (rpc || connecting) return rpc;
  connecting = true;
  const client = new RPC.Client({ transport: 'ipc' });
  // ready может прийти ДО резолва login (и присвоения rpc) — тогда пуш откладываем,
  // иначе он потеряется в connecting-гарде и статус в Discord замрёт
  client.on('ready', () => { connected = true; if (rpc) pushActivity(); else pendingPush = true; });
  try { await client.login({ clientId: APP_ID }); rpc = client; }
  catch { connected = false; setTimeout(() => { if (!rpc) ensureRpc(); }, 10000); } // Discord закрыт — тихо ждём
  connecting = false;
  if (rpc && pendingPush) { pendingPush = false; pushActivity(); }
  return rpc;
}

function pushActivity() {
  if (!settings.enabled) { clearActivity(); return; } // выключено — молчим, не светим даже idle
  const L = settings.lang === 'en'
    ? { idle: 'Watching nothing', season: 'Season', episode: 'Episode', anime: 'Anime', paused: 'Paused', watching: 'Watching' }
    : { idle: 'Ничего не смотрит', season: 'Сезон', episode: 'Эпизод', anime: 'Аниме', paused: 'Пауза', watching: 'Смотрит' };
  if (!presence) { // ничего не смотрит — дефолтный статус вместо пустоты
    send({ details: L.idle });
    return;
  }
  const p = presence;
  const seasonTxt = p.season ? `${L.season} ${p.season}` : '';
  const episodeTxt = p.episode ? `${L.episode} ${p.episode}` : '';
  const activity = {
    details: (p.title || L.anime).slice(0, 128),
    state: (`${seasonTxt} ${episodeTxt}`.replace(/\s{2,}/g, ' ').trim()).slice(0, 128) || undefined,
    largeImageKey: p.poster || undefined,
    largeImageText: (p.title || '').slice(0, 128) || undefined,
    smallImageKey: 'playing',
    smallImageText: p.siteLabel || L.watching
  };
  const json = JSON.stringify(activity); // всё стабильно, времён нет — дедуп честный
  if (json === lastSentJson) return;
  send(activity, json);
}

function send(activity, json) {
  json = json || JSON.stringify(activity);
  if (json === lastSentJson) return;
  ensureRpc()
    .then(c => c && c.setActivity(activity))
    .then(() => { lastSentJson = json; lastRpcError = ''; }) // метка только после успеха — иначе вечная заморозка
    .catch((e) => { lastRpcError = String((e && e.message) || e).slice(0, 120); dropRpc(); });
}

// Труба сдохла (Discord перезапустился/упал): выкидываем клиент и переподключаемся
function dropRpc() {
  try { rpc && rpc.destroy && rpc.destroy(); } catch {}
  rpc = null;
  if (connected) connected = false;
  setTimeout(() => { if (!rpc) ensureRpc(); }, 5000);
}

async function clearActivity() {
  lastSentJson = '';
  if (rpc) { try { await rpc.clearActivity(); } catch { dropRpc(); } }
}

// --- какой сайт и похожа ли страница на просмотр ---
function siteOf(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('animego')) return 'animego';
    if (h.includes('jut.su')) return 'jutsu';
    if (h.includes('yummyanime')) return 'yummyanime';
    if (h.includes('hianimes')) return 'hianime';
    if (h.includes('miruro')) return 'miruro';
    if (h.includes('yummyani')) return 'yummyani';
  } catch {}
  return null;
}

function isWatchUrl(site, pathname, search) {
  const p = pathname + search;
  switch (site) {
    case 'yummyani': return p.includes('/catalog/item/');
    case 'yummyanime': return p.endsWith('.html');
    case 'animego': return p.includes('/anime/');
    case 'jutsu': return /episode|film|ova|movie/i.test(p);
    // shortcut: паттерны hianime/miruro не проверены живьём — пришли ссылку на серию, докручу
    case 'hianime': case 'miruro': return p.includes('/watch/') || /[?&]ep=/i.test(p);
    default: return false;
  }
}

// --- последний визит на 6 сайтов из истории Chrome/Edge за 30 мин ---
async function latestWatchUrl(files = HISTORY_FILES) {
  if (!initSqlJs) return null;
  const SQL = await initSqlJs();
  const cutoff = (Date.now() - 30 * 60 * 1000) * 1000 + 11644473600000000; // webkit-микросекунды
  const like = ['animego.me', 'jut.su', 'yummyanime.tv', 'yummyani.me', 'hianimes.se', 'miruro.tv']
    .map(d => `url LIKE '%${d}%'`).join(' OR ');
  let best = null;
  for (const f of files || HISTORY_FILES) {
    const tmp = path.join(os.tmpdir(), `anirpc-hist-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`);
    try {
      fs.copyFileSync(f, tmp); // файл может быть занят браузером — тогда пропуск цикла
      const db = new SQL.Database(fs.readFileSync(tmp));
      const res = db.exec(`SELECT url, last_visit_time FROM urls WHERE (${like}) AND last_visit_time > ${cutoff} ORDER BY last_visit_time DESC LIMIT 3`);
      db.close();
      const row = res[0]?.values[0];
      if (row && (!best || row[1] > best.time)) best = { url: row[0], time: row[1] };
    } catch {} finally { try { fs.unlinkSync(tmp); } catch {} }
  }
  return best;
}

// --- чистый парсинг HTML fetched-страницы (без DOM) ---
function win1251(buf) {
  let s = '';
  for (const b of buf) s += b < 128 ? String.fromCharCode(b) : b === 0xA8 ? 'Ё' : b === 0xB8 ? 'ё' : b >= 0xC0 ? String.fromCharCode(0x410 + (b - 0xC0)) : '?';
  return s;
}

function cleanTitle(t) {
  return t.replace(/^смотреть\s+/i, '').replace(/\s+смотреть.*$/i, '').replace(/\s*—.*(серия|аниме).*/i, '')
    .replace(/\s*\/\s*Jut\.su.*$/i, '').replace(/\s*\|\s*AnimeGO.*$/i, '')
    .replace(/\s*:?\s*\d{1,2}\s*сезон\s*\d{1,4}\s*(серия|эпизод).*$/i, '')
    .replace(/\s*:?\s*\d{1,4}\s*(серия|эпизод).*$/i, '').trim().slice(0, 120);
}

function og(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]{1,300})`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content="([^"]{1,300})"[^>]+(?:property|name)="${prop}"`, 'i'));
  return (m && m[1]) || '';
}

async function fetchParse(pageUrl) {
  const r = await fetch(pageUrl, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || '';
  const site = siteOf(pageUrl);
  const html = /windows-1251|charset=x-user-defined/i.test(ct) || site === 'jutsu' ? win1251(buf) : buf.toString('utf8');
  const h1 = ((html.match(/<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i) || [])[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const titleTag = ((html.match(/<title>([^<]{1,160})/i) || [])[1] || '').trim();
  // miruro: h1 — это "Episode N", og:title — "Miruro". Название — из slug, сезон — оттуда же.
  // shortcut: формат slug'а подсмотрен на одной странице, может отличаться
  let title = cleanTitle(h1 || og(html, 'og:title') || titleTag);
  // hianime: первый h1 — служебный ("Genre"), настоящее название — в <title> до "Episode N"
  // ("One Punch Man Season 2 Specials Episode 1 Zv6yh Watch All Episodes at Hianime")
  if (site === 'hianime') {
    const m = titleTag.match(/^(.*?)\s+Episode\s+\d+/i);
    if (m && m[1].trim().length > 1) title = cleanTitle(m[1]);
  }
  let titleFromSlug = '';
  if (site === 'miruro' && (!title || /^(episode|ep\.?)\s*\d+$/i.test(title))) {
    const slug = new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || '';
    title = slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ').slice(0, 120) || title;
    titleFromSlug = slug;
  }
  let poster = og(html, 'og:image');
  if (/icon|logo|favicon/i.test(poster)) poster = ''; // miruro отдаёт иконку сайта, а не постер
  if (!poster) { // hianimes вообще без og:image — ищем <img> с постером (регресс переезда на Electron)
    const imgs = [...html.matchAll(/<img[^>]*src="([^"]{1,300})/gi)].map(m => m[1]);
    poster = imgs.find(u => /poster|cover/i.test(u)) || '';
  }
  if (poster.startsWith('//')) poster = 'https:' + poster; // yummyani отдаёт //static.yani.tv/...
  if (!poster.startsWith('http')) poster = '';
  const probe = `${h1} | ${titleTag}`;
  let season = null, episode = null;
  const se = probe.match(/(\d{1,2})\s*сезон[^0-9]{0,10}(\d{1,4})\s*(серия|эпизод)/i);
  const e2 = probe.match(/(\d{1,4})\s*(серия|эпизод|episode)/i);
  const s2 = probe.match(/(\d{1,2})\s*сезон/i);
  if (se) { season = se[1]; episode = se[2]; }
  else { if (e2) episode = e2[1]; if (s2) season = s2[1]; }
  if (!episode) { const m = probe.match(/episode\s*(\d{1,4})/i); if (m) episode = m[1]; } // EN порядок: "Episode 12"
  if (!season) { const m = probe.match(/season\s*(\d{1,2})/i); if (m) season = m[1]; } // "Season 2"
  const u = new URL(pageUrl);
  if (!episode) {
    const m = (u.pathname + u.search).match(/(?:episode|seriya|seria|ep)[-_]?(\d{1,4})/i);
    if (m) episode = m[1];
  }
  if (!season) {
    const m = u.pathname.match(/season[-_]?(\d{1,2})/i) || titleFromSlug.match(/season[-_]?(\d{1,2})/i);
    if (m) season = m[1];
  }
  return { site, siteLabel: SITE_LABELS[site], title, season, episode, poster, url: pageUrl,
    currentTime: null, duration: null, paused: false, hasVideo: false, hasPlayer: true };
}

// --- цикл слежки: новый URL серии → фетч → RPC; уход со страницы → clear ---
async function watchTick(files) {
  try {
    const hit = await latestWatchUrl(files);
    const url = hit ? hit.url : '';
    if (!url) { presence = null; pushActivity(); lastUrl = ''; return; }
    const site = siteOf(url);
    const u = new URL(url);
    if (!site || settings.sites[site] === false || !isWatchUrl(site, u.pathname, u.search)) {
      presence = null; pushActivity(); // ушёл с плеера — дефолтный статус (дедуп отсечёт повтор)
      lastUrl = url;
      return;
    }
    if (url === lastUrl && presence) return; // та же серия — не дёргаем Discord
    lastUrl = url;
    const p = await fetchParse(url).catch(() => null);
    if (!p || !p.title) return;
    presence = { ...p, at: Date.now() };
    pushActivity();
  } catch {}
}

// --- окно приложения ---
function createWin() {
  win = new BrowserWindow({
    width: 400, height: 700, resizable: false, autoHideMenuBar: true, title: 'AniRPC',
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: false }
  });
  win.loadFile('renderer/index.html');
}

// --- IPC ---
ipcMain.handle('get-state', () => ({ connected, enabled: settings.enabled, presence, settings,
  autostart: getAutostart(), rpcError: lastRpcError }));
ipcMain.handle('set-autostart', (e, on) => setAutostart(!!on));

// Автозагрузка своим ходом: штатный app.setLoginItemSettings с кастомными args
// пишет в реестр, но потом сам же отвечает openAtLogin:false. Поэтому ключ ведём сами:
// имя стабильно (не зависит от упаковки), команда абсолютная, чтение — из реестра.
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_NAME = 'AniRPC';
function autostartCmd() { return `"${process.execPath}" "${app.getAppPath()}"`; }
function getAutostart() {
  try {
    const out = execFileSync('reg', ['query', RUN_KEY, '/v', RUN_NAME], { encoding: 'utf8' });
    return out.includes(app.getAppPath());
  } catch { return false; }
}
function setAutostart(on) {
  try {
    try { execFileSync('reg', ['delete', RUN_KEY, '/v', 'electron.app.Electron', '/f']); } catch {} // хвост dev-попыток через штатный API
    if (on) execFileSync('reg', ['add', RUN_KEY, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', autostartCmd(), '/f']);
    else execFileSync('reg', ['delete', RUN_KEY, '/v', RUN_NAME, '/f']);
  } catch {}
  return getAutostart();
}
ipcMain.on('set-settings', (e, s) => {
  settings = { ...DEFAULTS, ...s, sites: { ...DEFAULTS.sites, ...((s && s.sites) || {}) } };
  saveSettings();
  pushActivity();
});
ipcMain.on('open-external', (e, url) => { if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url); });

app.whenReady().then(() => {
  createWin();
  ensureRpc();
  if (!process.env.ANIRPC_TEST) { setTimeout(watchTick, 5000); setInterval(watchTick, 15000); } // в тестах тики дёргаем вручную
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Экспорт для smoke-тестов (в проде ничего не требует этот модуль).
module.exports = { siteOf, isWatchUrl, cleanTitle, og, win1251, latestWatchUrl, fetchParse, watchTick, SITE_LABELS };
