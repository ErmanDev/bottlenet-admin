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

## Related

- SoftAP kiosk UI lives on the ESP8266 (`PlasticBottle_WiFi` → http://192.168.4.1/)
- UI assets also exist in `ErmanDev/bottlenet-ui`
