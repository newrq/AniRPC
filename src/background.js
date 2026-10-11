// Фоновый Service Worker: принимает данные от content-скриптов,
// держит WebSocket до локального моста и хранит состояние для popup.
// Мост обязателен: из расширения нет доступа к Discord IPC напрямую.

const BRIDGE_URL = 'ws://127.0.0.1:47201';
const RECONNECT_MS = 5000;

const DEFAULTS = {
  enabled: true,
  showTime: true,
  clientId: '1558926718516076634', // Application ID из Discord Developer Portal
  // {title} {season} {episode}
  formatDetails: '{title}',
  formatState: '{season} {episode}',
  sites: { yummyani: true, yummyanime: true, animego: true, jutsu: true, hianime: true, miruro: true }
};

let ws = null;
let connected = false;
let lastPresence = null; // последний payload от content-скрипта
let lastSentJson = '';
let settings = { ...DEFAULTS };

init();

async function init() {
  const stored = await chrome.storage.local.get(['settings']);
  settings = { ...DEFAULTS, ...(stored.settings || {}) };
  if (!settings.clientId) settings.clientId = DEFAULTS.clientId; // миграция со старого пустого значения
  connect();
  setInterval(() => { if (!ws || ws.readyState > 1) connect(); }, RECONNECT_MS);

  // Сообщения от content-скриптов и popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'PRESENCE_UPDATE') { handlePresence(msg.payload); }
    if (msg?.type === 'PRESENCE_CLEAR') { handleClear(); }
    if (msg?.type === 'GET_STATE') {
      sendResponse({ connected, enabled: settings.enabled, presence: lastPresence });
      return true;
    }
    if (msg?.type === 'SETTINGS_SAVED') { settings = { ...DEFAULTS, ...msg.settings }; pushActivity(); }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) { settings = { ...DEFAULTS, ...changes.settings.newValue }; pushActivity(); }
  });
}

function connect() {
  try { ws?.close(); } catch {}
  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch { setConnected(false); return; }
  ws.onopen = () => { setConnected(true); pushActivity(); };
  ws.onclose = () => setConnected(false);
  ws.onerror = () => { try { ws.close(); } catch {} };
}

function setConnected(v) {
  connected = v;
  // popup сам опрашивает GET_STATE, пушить нечего — service worker может спать
  chrome.storage.local.set({ bridgeConnected: v });
}

function handlePresence(payload) {
  lastPresence = { ...payload, at: Date.now() };
  chrome.storage.local.set({ lastPresence });
  pushActivity();
}

function handleClear() {
  lastPresence = null;
  chrome.storage.local.remove('lastPresence');
  lastSentJson = '';
  sendToBridge({ type: 'CLEAR' });
}

// Собирает Discord activity из payload + настроек и шлёт на мост
function pushActivity() {
  if (!lastPresence) return;
  if (!settings.enabled) { sendToBridge({ type: 'CLEAR' }); lastSentJson = ''; return; }

  const p = lastPresence;
  const seasonTxt = p.season ? `Сезон ${p.season}` : '';
  const episodeTxt = p.episode ? `Эпизод ${p.episode}` : '';
  const fill = (tpl) => tpl
    .replace('{title}', p.title || 'Аниме')
    .replace('{season}', seasonTxt)
    .replace('{episode}', episodeTxt)
    .replace(/\s{2,}/g, ' ').trim();

  const activity = {
    details: fill(settings.formatDetails || '{title}').slice(0, 128),
    state: fill(settings.formatState || '{season} {episode}').slice(0, 128) || undefined,
    largeImageKey: p.poster || undefined, // Discord умеет подтягивать https-URL
    largeImageText: (p.title || '').slice(0, 128) || undefined,
    smallImageKey: p.paused ? 'paused' : 'playing',
    smallImageText: p.paused ? 'Пауза' : (p.siteLabel || 'Смотрит')
  };

  // Таймлайн: endTimestamp только во время воспроизведения
  if (settings.showTime && !p.paused && p.currentTime != null && p.duration) {
    activity.startTimestamp = Date.now() - Math.floor(p.currentTime * 1000);
    activity.endTimestamp = activity.startTimestamp + Math.floor(p.duration * 1000);
  }

  const json = JSON.stringify(activity);
  if (json === lastSentJson) return; // shortcut: не спамим мост дублями, шлём только изменения
  lastSentJson = json;
  sendToBridge({ type: 'SET_ACTIVITY', clientId: settings.clientId || undefined, activity });
}

function sendToBridge(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
