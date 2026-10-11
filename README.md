<div align="center">

# 🌸 AniRPC

**Discord Rich Presence for anime streaming sites**

Minimal Chrome (MV3) extension + a tiny local bridge — see what you watch, right in Discord.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-f4a6be?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-extension-16181d?style=flat-square)
![Node](https://img.shields.io/badge/bridge-Node.js-16181d?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-16181d?style=flat-square)

</div>

---

## ✨ What it does

Open an episode on a supported site — your Discord status updates automatically:

> **Frieren: Beyond Journey's End**
> *Season 1 · Episode 12 — AnimeGO*
> *08:24 / 23:40 elapsed, poster included*

- 🎬 Title, season & episode, playback timeline, anime poster
- 🌗 RU / EN interface with a slider in the popup header (also switches the site list)
- 🔌 Connection pill, live "now playing" card, broadcast toggle, per-site pills
- 💗 Pink-on-dark minimal popup with springy micro-interactions

## 📺 Supported sites

| | RU | | EN |
|---|---|---|---|
| 🍥 | `ru.yummyani.me` | 🎞️ | `hianimes.se` (HiAnime) |
| 🍡 | `yummyanime.tv` | 🌙 | `miruro.tv` (Miruro) |
| ⛩️ | `animego.me` | | |
| 🌀 | `jut.su` | | |

## 🧩 Why a bridge?

Browser extensions cannot reach Discord's local IPC pipes, so:

```
site DOM → content.js → background.js ──WebSocket──▶ bridge/server.js ──IPC──▶ Discord
                    ws://127.0.0.1:47201        (Node + discord-rpc)
```

## 🚀 Quickstart

### 1. Discord application *(2 min)*

1. Go to https://discord.com/developers/applications → **New Application**.
2. Copy the **Application ID** and paste it as `clientId` in `src/background.js`
   (or export it as `DISCORD_CLIENT_ID` for the bridge — env wins).
3. *(Optional)* Rich Presence → Art Assets → upload `playing` / `paused` icons.

### 2. Start the bridge

```powershell
cd bridge
npm i
$env:DISCORD_CLIENT_ID="your_client_id"
node server.js
# expect: [bridge] ws://127.0.0.1:47201, then "Discord ready as ..."
```

Keep this window open while watching.

### 3. Install the extension

1. Open `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → pick the `MovieRPC` folder (the one with `manifest.json`).
3. Open any episode → the popup shows **Connected** and the title. 💗

## 🗂️ Project structure

- `manifest.json` — MV3, one content script matched on all 6 domains.
- `src/content.js` — DOM parsing: title (per-site selectors → `og:title`), season/episode (active episode button + regex + URL), poster (`og:image`, `video[poster]`), time (`<video>`).
- `src/background.js` — WebSocket client, status templates, duplicate suppression.
- `src/popup.*` — status pill, now-playing card, toggle, site pills, RU/EN slider, donate heart.
- `src/preview.html` — clickable popup mock for design review (dev only, not shipped).
- `bridge/` — Node bridge (`ws` + `discord-rpc`).
- `.archify/` — architecture diagram.

## 🖼️ Posters in RPC

`largeImageKey` is sent as the poster's https URL (`og:image`). Discord resolves
external URLs itself, so artwork usually shows even without uploaded app assets.

## ⚠️ Limitations

- On **animego / yummyanime** the video plays inside a cross-origin iframe (Kodik) —
  time and pause state are unreachable, so the status ships without a progress bar.
- On **jut.su** the `<video>` lives in the main DOM — everything works, timeline included.
- Closing the episode tab can leave the last status stuck until the next update
  (known issue — a `pagehide` clear is planned).

---

<div align="center">

Made with 💗 for anime nights · If it made you smile — <a href="https://www.patreon.com/cw/howoka">support the author</a>

</div>
