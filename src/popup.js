// Popup: статус моста, сейчас играет, тумблер, сайты, язык RU/EN.
// Всё хранится в chrome.storage.local.settings.

const DEFAULTS = {
  enabled: true, lang: 'ru',
  sites: { yummyani: true, yummyanime: true, animego: true, jutsu: true, hianime: true, miruro: true }
};
// Сайты зависят от языка: RU — 4 русских ресурса, EN — HiAnime + Miruro
const SITES_BY_LANG = {
  ru: {
    yummyani: { name: 'YummyAnime RU', icon: 'https://ru.yummyani.me/favicon.ico' },
    yummyanime: { name: 'YummyAnime', icon: 'https://yummyanime.tv/favicon.ico' },
    animego: { name: 'AnimeGO', icon: 'https://animego.me/favicon.ico' },
    jutsu: { name: 'Jut.su', icon: 'https://jut.su/favicon.ico' }
  },
  en: {
    hianime: { name: 'HiAnime', icon: 'https://hianimes.se/favicon.ico' },
    miruro: { name: 'Miruro', icon: 'https://barelystarted.miruro.tv/favicon.ico' }
  }
};
const STR = {
  ru: { power: 'Трансляция статуса', on: 'Подключено', off: 'Нет моста', standby: 'Выключено', idle: 'Ничего не воспроизводится', disabled: 'Трансляция выключена', hint: 'Открой серию на поддерживаемом сайте', sites: 'Сайты', donate: 'Поддержать автора', season: 'Сезон', episode: 'Эпизод', paused: ' · Пауза', anime: 'Аниме', langAria: 'Switch to English' },
  en: { power: 'Broadcast status', on: 'Connected', off: 'No bridge', standby: 'Off', idle: 'Nothing playing', disabled: 'Broadcast off', hint: 'Open an episode on a supported site', sites: 'Sites', donate: 'Support the author', season: 'Season', episode: 'Episode', paused: ' · Paused', anime: 'Anime', langAria: 'Переключить на русский' }
};
const t = () => STR[settings.lang] || STR.ru;
const sitesOf = () => SITES_BY_LANG[settings.lang] || SITES_BY_LANG.ru;

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

init();

async function init() {
  const stored = await chrome.storage.local.get(['settings']);
  settings = { ...DEFAULTS, ...(stored.settings || {}) };
  settings.lang = settings.lang === 'en' ? 'en' : 'ru';
  settings.sites = { ...DEFAULTS.sites, ...(stored.settings?.sites || {}) };

  bindControls();
  applyLang(false);
  refreshState();
  setInterval(refreshState, 3000); // дёшево и живо: подтягиваем прогресс/статус
}

function bindControls() {
  const tg = $('toggle');
  tg.onclick = () => {
    settings.enabled = !settings.enabled;
    save(); paintToggle();
    tg.classList.remove('boing'); void tg.offsetWidth; tg.classList.add('boing'); // перезапуск bounce
    if (settings.enabled) confettiBurst(tg);
  };
  $('langBtn').onclick = () => {
    settings.lang = settings.lang === 'ru' ? 'en' : 'ru';
    save(); applyLang(true);
  };
}

function applyLang(animate) {
  document.documentElement.lang = settings.lang;
  $('langBtn').dataset.lang = settings.lang;
  $('langBtn').setAttribute('aria-label', t().langAria);
  const swap = () => {
    $('powerLabel').textContent = t().power;
    $('toggle').setAttribute('aria-label', t().power);
    $('sitesTitle').textContent = t().sites;
    $('donateText').textContent = t().donate;
    $('donate').setAttribute('aria-label', t().donate);
    renderSettings();
    refreshState();
    document.body.classList.remove('switching');
  };
  // fade out → подмена строк на полупрозрачности → fade in
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('switching');
    setTimeout(swap, 160);
  } else swap();
}

// Взрыв конфети из центра тумблера: только transform/opacity, без зависимостей
function confettiBurst(anchor) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = anchor.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const colors = ['#f4a6be', '#ffb6c1', '#ffffff', '#ffd9e4'];
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('span');
    s.className = 'confetti';
    const w = 4 + Math.random() * 5;
    s.style.cssText = `left:${cx}px;top:${cy}px;width:${w}px;height:${Math.random() < .5 ? w : w * .45}px;background:${colors[i % 4]};border-radius:${Math.random() < .4 ? '50%' : '2px'}`;
    document.body.append(s);
    const ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 90;
    s.animate([
      { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px),calc(-50% + ${Math.sin(ang) * dist + 60}px)) rotate(${(Math.random() * 540 - 270) | 0}deg)`, opacity: 0 }
    ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.15,.6,.4,1)' }).onfinish = () => s.remove();
  }
}

function renderSettings() {
  paintToggle();
  $('sites').innerHTML = '';
  for (const [key, { name, icon }] of Object.entries(sitesOf())) {
    const l = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = settings.sites[key] !== false;
    cb.onchange = () => { settings.sites[key] = cb.checked; save(); };
    const img = document.createElement('img');
    img.src = icon; img.alt = ''; img.width = 18; img.height = 18;
    img.onerror = () => { img.style.visibility = 'hidden'; }; // нет иконки — место держим, вёрстка не прыгает
    l.append(cb, img, document.createTextNode(name));
    $('sites').append(l);
  }
}

function paintToggle() {
  $('toggle').setAttribute('aria-checked', String(!!settings.enabled));
}

async function save() {
  await chrome.storage.local.set({ settings });
  chrome.runtime.sendMessage({ type: 'SETTINGS_SAVED', settings }); // будим background
}

async function refreshState() {
  const st = await chrome.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
  const on = !!st?.connected;
  // эффективное состояние: мост есть, но трансляция выключена — не «Подключено»
  const eff = on && settings.enabled;
  $('status').classList.toggle('on', eff);
  $('statusText').textContent = !settings.enabled ? t().standby : on ? t().on : t().off;
  paintNow(st?.presence);
}

function paintNow(p) {
  if (!p || !settings.enabled) {
    $('nowCard').classList.remove('live');
    $('nowTitle').textContent = settings.enabled ? t().idle : t().disabled;
    $('nowSub').textContent = t().hint;
    $('poster').hidden = true; $('bar').hidden = true; $('nowTime').hidden = true;
    return;
  }
  const ep = [p.season ? `${t().season} ${p.season}` : '', p.episode ? `${t().episode} ${p.episode}` : ''].filter(Boolean).join(' · ');
  $('nowTitle').textContent = p.title || t().anime;
  $('nowCard').classList.toggle('live', !p.paused);
  $('nowSub').textContent = `${p.siteLabel || ''}${ep ? ' — ' + ep : ''}${p.paused ? t().paused : ''}`;
  if (p.poster) { $('poster').src = p.poster; $('poster').hidden = false; }
  if (p.duration && p.currentTime != null) {
    $('bar').hidden = false; $('nowTime').hidden = false;
    const pct = Math.min(100, (p.currentTime / p.duration) * 100);
    $('barFill').style.width = `${pct}%`;
    $('barDot').style.left = `${pct}%`;
    $('nowTime').textContent = `${fmt(p.currentTime)} / ${fmt(p.duration)}`;
  }
}

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
