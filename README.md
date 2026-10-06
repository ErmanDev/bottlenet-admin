# BottleNet Admin

Live station admin for BottleNet (ESP8266 ingest → Vercel → Neon Postgres).

**Production:** https://bottlenet-admin.vercel.app/

## What’s included

- Admin UI (PIN `1234`) — no mock/demo station data
- `/api/status` (GET) and `/api/ingest` (POST) for ESP8266 status
- Neon Postgres via `DATABASE_URL` (set on Vercel; not committed)
- Client polls `/api/status` every ~2s; shows **Waiting** until the board posts

## Local / deploy notes

```bash
npm install
# Set DATABASE_URL to your Neon pooler connection string
vercel --prod
```

ESP8266 firmware posts JSON to `/api/ingest` with header `X-BottleNet-Key` (default `bottlenet-dev-key`).

## ESP32 security unit (Security and alarms tab)

Separate board (`esp-32-code/esp.ino`): IR motion sensor (GPIO 27), brake/tamper switch (GPIO 26), buzzer (GPIO 25), LED (GPIO 33).

- Station-only Wi‑Fi, no hotspot or local web page: set `WIFI_SSID` / `WIFI_PASSWORD` in the sketch. Status is viewed in the admin Security tab (and on Serial).
- Posts to `/api/security` on every sensor change plus a 5 s heartbeat, same `X-BottleNet-Key`.
- Server stores the latest status and an event log in Neon (`bottlenet_security_status`, `bottlenet_security_events`): motion, theft attempts (with duration), device online/offline/restart. Offline = no update for 20 s.
- `GET /api/security?limit=100` returns `{ online, status, events }`; `POST {"action":"ack","ids":[...]}` or `{"action":"ack","all":true}` acknowledges alarms.

## Related

- SoftAP kiosk UI lives on the ESP8266 (`PlasticBottle_WiFi` → http://192.168.4.1/)
- UI assets also exist in `ErmanDev/bottlenet-ui`
