/* ESP32 security device: GET status + event log, POST ingest (keyed) or acknowledge. */
const { ingest, snapshot, acknowledge, OFFLINE_MS } = require('../lib/security');
const { dbUrl } = require('../lib/store');
const KEY = process.env.BOTTLENET_INGEST_KEY || 'bottlenet-dev-key';

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') { resolve(req.body); return; }
    if (typeof req.body === 'string') {
      try { resolve(JSON.parse(req.body)); } catch (e) { reject(e); }
      return;
    }
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw) { resolve(null); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(Object.assign({ storage: dbUrl() ? 'postgres' : 'ephemeral' }, obj)));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-BottleNet-Key');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://local');
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
    const { status, events } = await snapshot(limit);
    const online = !!status && Date.now() - Number(status.updatedAt) <= OFFLINE_MS;
    send(res, 200, { ok: true, online, offlineAfterMs: OFFLINE_MS, serverTime: Date.now(), status, events });
    return;
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch { send(res, 400, { ok: false, error: 'invalid json' }); return; }
    if (!body || typeof body !== 'object') { send(res, 400, { ok: false, error: 'json body required' }); return; }

    // Admin dashboard: acknowledge alarms (the dashboard has no server-side auth yet).
    if (body.action === 'ack') {
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
      await acknowledge(ids, body.all === true);
      send(res, 200, { ok: true });
      return;
    }

    // ESP32 sensor push.
    if (req.headers['x-bottlenet-key'] !== KEY) { send(res, 401, { ok: false, error: 'unauthorized' }); return; }
    const saved = await ingest(body);
    send(res, 200, { ok: true, updatedAt: saved.updatedAt });
    return;
  }

  send(res, 405, { ok: false, error: 'GET or POST only' });
};
