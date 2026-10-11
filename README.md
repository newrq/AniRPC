# AniRPC — Discord Rich Presence для аниме-сайтов

Минимальное MV3-расширение + локальный мост. RU: `ru.yummyani.me`, `yummyanime.tv`, `animego.me`, `jut.su`. EN: `hianimes.se`, `miruro.tv`. Язык переключается кнопкой EN/RU в шапке popup (заодно меняет список сайтов).

## Зачем мост

Расширение не имеет доступа к Discord IPC-пайпам, поэтому `background.js` шлёт activity по WebSocket на `ws://127.0.0.1:47201`, а `bridge/server.js` (Node + `discord-rpc`) уже публикует его в Discord.

## 1. Discord-приложение (2 мин)

1. https://discord.com/developers/applications → New Application.
2. Скопируй **Application ID** (это Client ID).
3. (Опционально) Rich Presence → Art Assets: загрузи иконки `playing` / `paused`.

## 2. Запуск моста

```powershell
cd bridge
npm i
$env:DISCORD_CLIENT_ID="твой_client_id"; node server.js
# должен написать: [bridge] ws://127.0.0.1:47201, затем "Discord готов как ..."
```

Держи окно открытым во время просмотра. Client ID также можно вставить в popup расширения (перекрывает env).

## 3. Установка расширения

1. `chrome://extensions` → включи **Режим разработчика**.
2. **Загрузить распакованное расширение** → выбери папку `MovieRPC` (где лежит `manifest.json`).
3. Открой серию на одном из 4 сайтов → иконка popup покажет «Подключено» и название.

## Структура

- `manifest.json` — MV3, один content-скрипт на 4 домена.
- `src/content.js` — парсинг DOM: title (per-site селекторы → `og:title`), сезон/эпизод (активная кнопка + regex + URL), постер (`og:image`), время (`<video>`).
- `src/background.js` — WebSocket-клиент моста, шаблоны строк, дедуп одинаковых activity.
- `src/popup.*` — статус, «сейчас играет», тумблер, вкл/выкл сайтов.
- `bridge/` — Node-мост `ws` + `discord-rpc`.

## Постеры в RPC

`largeImageKey` шлётся как https-URL постера (`og:image`). Discord подтягивает внешние URL сам; если твой Client ID без ассетов — картинка всё равно обычно отображается через медиа-прокси.

## Ограничения

- На animego / yummyanime видео играет в cross-origin iframe (Kodik) — время и пауза недоступны, статус идёт без прогресс-бара.
- На jut.su `<video>` в главном DOM — работает всё, включая таймлайн.
