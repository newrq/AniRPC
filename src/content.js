// Единый content-скрипт для 4 сайтов: определяет сайт по hostname
// и вытаскивает title / сезон / эпизод / video-время / постер.
// Сделан defensive: сначала точные селекторы, затем эвристики (og-теги, regex).

(() => {
  const HOST = location.hostname.replace(/^www\./, '');
  const SITE = HOST.includes('animego') ? 'animego'
    : HOST.includes('jut.su') ? 'jutsu'
    : HOST.includes('yummyanime') ? 'yummyanime'
    : HOST.includes('hianimes') ? 'hianime'
    : HOST.includes('miruro') ? 'miruro' : 'yummyani';

  const SITE_LABEL = {
    yummyani: 'YummyAnime (ru)',
    yummyanime: 'YummyAnime',
    animego: 'AnimeGO',
    jutsu: 'Jut.su',
    hianime: 'HiAnime',
    miruro: 'Miruro'
  }[SITE];

  let lastJson = '';

  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => [...r.querySelectorAll(s)];
  const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const meta = (prop) => qs(`meta[property="${prop}"]`)?.content || qs(`meta[name="${prop}"]`)?.content || '';

  // --- title ---
  function getTitle() {
    // 1. per-site точные места
    const perSite = {
      animego: ['.anime-title h1', '.animetitle h1', 'h1'],
      jutsu: ['.b-b-title h1', 'h1.header', 'h1'],
      yummyani: ['h1', '.poster-title', '.card-title'],
      yummyanime: ['h1', '.poster-title', '.card-title'],
      hianime: ['h1'],
      miruro: ['h1']
    }[SITE];
    for (const s of perSite) { const t = text(qs(s)); if (t && t.length > 1 && t.length < 150) return cleanTitle(t); }
    // 2. fallback: og:title / <title>
    const og = meta('og:title');
    if (og) return cleanTitle(og);
    return cleanTitle(document.title);
  }

  function cleanTitle(t) {
    return t.replace(/^смотреть\s+/i, '').replace(/\s+смотреть.*$/i, '').replace(/\s*—.*(серия|аниме).*/i, '')
      .replace(/\s*\/\s*Jut\.su.*$/i, '').replace(/\s*\|\s*AnimeGO.*$/i, '')
      // хвост вида ": 1 сезон 1 серия" (jut.su пишет его прямо в h1)
      .replace(/\s*:?\s*\d{1,2}\s*сезон\s*\d{1,4}\s*(серия|эпизод).*$/i, '')
      .replace(/\s*:?\s*\d{1,4}\s*(серия|эпизод).*$/i, '').trim().slice(0, 120);
  }

  // --- сезон / эпизод: ищем по активным кнопкам серий + regex по странице ---
  function getSeasonEpisode() {
    let season = null, episode = null;

    // активная кнопка серии (общие паттерны всех 4 сайтов)
    const activeEp = qs('.episode.active, .episodes-list .active, .series .active, [class*="episode"].active, .playlist .active, .video-list .active');
    if (activeEp) {
      const m = text(activeEp).match(/(\d{1,4})/);
      if (m) episode = m[1];
    }
    // выпадающий список / заголовок плеера: "12 серия", "Эпизод 5", "1 сезон 12 серия"
    if (!episode || !season) {
      const probe = [
        text(qs('.player-header')), text(qs('.video-title')), text(qs('h1')),
        text(qs('.breadcrumb')), document.title
      ].join(' | ');
      const se = probe.match(/(\d{1,2})\s*сезон[^0-9]{0,10}(\d{1,4})\s*(серия|эпизод)/i);
      const e2 = probe.match(/(\d{1,4})\s*(серия|эпизод|episode)/i);
      const s2 = probe.match(/(\d{1,2})\s*сезон/i);
      if (se) { season = se[1]; episode = se[2]; }
      else { if (e2 && !episode) episode = e2[1]; if (s2 && !season) season = s2[1]; }
    }
    // URL-паттерны: /episode-12, /12-seriya, ?ep=5, /season-1/
    if (!episode) {
      const m = (location.pathname + location.search).match(/(?:episode|seriya|seria|ep)[-_]?(\d{1,4})/i);
      if (m) episode = m[1];
    }
    if (!season) {
      const m = location.pathname.match(/season[-_]?(\d{1,2})/i); // jut.su: /season-1/episode-1.html
      if (m) season = m[1];
    }
    return { season, episode };
  }

  // --- постер ---
  function getPoster() {
    const cands = [
      meta('og:image'),
      qs('video[poster]')?.poster || '', // jut.su: постер прямо в <video>
      qs('.anime-poster img')?.src, qs('[class*="poster"] img')?.src,
      qs('.card img')?.src, [...document.images].find(i => /poster|cover/i.test(i.src || ''))?.src
    ].filter(Boolean)
      .map(u => u.startsWith('//') ? 'https:' + u : u) // yummyani отдаёт //static.yani.tv/...
      .filter(u => u.startsWith('http'));
    return cands[0] || '';
  }

  // --- видео ---
  function getVideo() {
    const videos = qsa('video').filter(v => v.duration && v.duration > 60); // отсев рекламных <video>
    const v = videos.sort((a, b) => (b.clientWidth || 0) - (a.clientWidth || 0))[0] || qs('video');
    if (!v) return { currentTime: null, duration: null, paused: true, hasVideo: false };
    return { currentTime: Math.floor(v.currentTime || 0), duration: Math.floor(v.duration || 0), paused: !!v.paused, hasVideo: true };
  }

  function collect() {
    const { season, episode } = getSeasonEpisode();
    const v = getVideo();
    // shortcut: плеер в cross-origin iframe (Kodik на animego/yummyanime) недоступен из
    // content-скрипта — тогда шлём статус без времени/паузы, лишь бы было название и серия
    const hasPlayer = v.hasVideo || !!qs('iframe[src*="kodik"], iframe[src*="alloha"], .player-video__online, #my-player, #player');
    return {
      site: SITE, siteLabel: SITE_LABEL,
      title: getTitle(), season, episode,
      poster: getPoster(), url: location.href,
      ...v, hasPlayer,
      paused: v.hasVideo ? v.paused : false
    };
  }

  function tick() {
    chrome.storage.local.get(['settings'], ({ settings }) => {
      if (settings && settings.sites && settings.sites[SITE] === false) {
        chrome.runtime.sendMessage({ type: 'PRESENCE_CLEAR' });
        lastJson = '';
        return;
      }
      const p = collect();
      if (!p.title || (!p.hasVideo && !p.hasPlayer)) return; // нет плеера — светить нечего
      const json = JSON.stringify([p.title, p.season, p.episode, p.paused]);
      // шлём при смене серии/паузы + heartbeat раз в 15 с (таймлайн обновляет мост по timestamps)
      if (json !== lastJson || Date.now() - (tick._last || 0) > 15000) {
        tick._last = Date.now(); lastJson = json;
        chrome.runtime.sendMessage({ type: 'PRESENCE_UPDATE', payload: p });
      }
    });
  }

  // video-события → мгновенная реакция на play/pause/seek
  document.addEventListener('play', tick, true);
  document.addEventListener('pause', tick, true);
  document.addEventListener('seeked', tick, true);
  // смена серии обычно меняет DOM без перезагрузки
  let deb = null;
  new MutationObserver(() => { clearTimeout(deb); deb = setTimeout(tick, 1500); })
    .observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 5000);
  setTimeout(tick, 2500);
})();
