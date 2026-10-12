<div align="center">

# 🌸 AniRPC

**Discord Rich Presence for anime streaming sites — standalone desktop app**

Watch anime in your own browser. Discord shows what you're watching. No extension, no bridge, no setup.

![Electron](https://img.shields.io/badge/Electron-app-f4a6be?style=flat-square)
![Discord RPC](https://img.shields.io/badge/Discord-RPC-16181d?style=flat-square)
![i18n](https://img.shields.io/badge/RU-EN-16181d?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-16181d?style=flat-square)

</div>

---

## ✨ What it does

Open an episode on a supported site — your Discord status updates by itself:

> **Frieren: Beyond Journey's End**
> *Season 1 · Episode 12 — AnimeGO*

- 🎬 Title, season & episode, anime poster — picked up automatically
- 🌗 Full RU / EN interface (slider in the header) — Discord texts switch too
- 🔌 Honest connection pill, live "now playing" card with a captured-site badge
- 🎚️ Broadcast toggle, per-site pills, Patreon heart, autostart rocket
  (hover for a tooltip, click to put the app into Windows autostart)
- 😴 Idle shows “Watching nothing” instead of a stale or empty status
- 💗 Pink-on-dark UI with springy micro-interactions

## 📺 Supported sites

| | RU | | EN |
|---|---|---|---|
| 🍥 | `ru.yummyani.me` | 🎞️ | `hianimes.se` (HiAnime) |
| 🍡 | `yummyanime.tv` | 🌙 | `miruro.tv` (Miruro) |
| ⛩️ | `animego.me` | | |
| 🌀 | `jut.su` | | |

## 🚀 Run it (no setup)

Requirements: [Node.js LTS](https://nodejs.org/) + the Discord **desktop** app running.

```powershell
npm i
npm start
```

That's it. The Application ID is built in, settings live next to the app —
there is nothing to configure.

## 🧩 How it works

```
your browser ──History──▶ main ──fetch + parse──▶ Discord client
 episode URL        title · series · poster        discord-rpc
```

You watch in **your own Chrome, Edge or Brave**. Every 15 seconds the app reads
a throwaway copy of the browser history (your data never leaves the machine),
takes the latest page on the 6 supported sites, fetches that page itself and
extracts the title, season/episode and poster. Sending is deduplicated, failed
sends are retried after reconnect — the status never freezes silently.

- `main.js` — app window, history watcher (`sql.js`), page parser, settings
  (`settings.json`), direct Discord RPC with reconnect.
- `preload-ui.js` + `renderer/` — the app window UI (status, toggle, sites, language, donate).

## 🖼️ Posters in RPC

The poster's https URL is sent as the large image — Discord resolves external
URLs itself, so artwork usually shows even without uploaded app assets. Sites
without `og:image` fall back to poster `<img>` tags.

## ⚠️ Limitations

- No playback timeline or pause state — the app sees the episode page, not the
  player. The status shows title, series and poster.
- Only Chrome / Edge / Brave history is read (Default profile, last 30 minutes).
  Firefox, Opera, Yandex and other profiles are not covered yet.
- RPC needs the Discord desktop app open; without it the pill shows **No Discord**.

---

<div align="center">

Made with 💗 for anime nights · If it made you smile — <a href="https://www.patreon.com/cw/howoka">support the author</a>

</div>
