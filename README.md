# BottleNet Admin (live ESP8266)

Admin UI on Vercel. Status comes from ESP8266 **ingest** (not SoftAP mock).

## How live data works
1. SoftAP portal stays on the ESP for people depositing bottles.
2. ESP8266 also joins your shop/home Wi‑Fi (STA) so it can reach the internet.
3. Every few seconds the ESP POSTs `/api/status` JSON to `/api/ingest`.
4. This admin page polls `/api/status` (same Vercel site).

SoftAP alone cannot feed Vercel (no internet path from 192.168.4.1 to the cloud).

## Demo PIN
1234

## Ingest key
Header `X-BottleNet-Key: bottlenet-dev-key`
(or set `BOTTLENET_INGEST_KEY` in Vercel env)
