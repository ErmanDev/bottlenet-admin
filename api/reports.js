/* Portal problem reports: GET list, POST relay from the ESP8266 (keyed) or admin status change.
   Each new report is also emailed to station staff (see lib/mailer.js). */
const { normalize, addReport, listReports, setReportStatus, markReportEmailed, STATUSES } = require('../lib/reports');
const { sendReportEmail } = require('../lib/mailer');
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
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
    send(res, 200, { ok: true, serverTime: Date.now(), reports: await listReports(limit) });
    return;
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch { send(res, 400, { ok: false, error: 'invalid json' }); return; }
    if (!body || typeof body !== 'object') { send(res, 400, { ok: false, error: 'json body required' }); return; }

    // Admin dashboard: change a report's status (the dashboard has no server-side auth yet).
    if (body.action === 'status') {
      const id = Number(body.id);
      if (!Number.isFinite(id) || !STATUSES.includes(body.status)) { send(res, 400, { ok: false, error: 'id and valid status required' }); return; }
      const found = await setReportStatus(id, body.status);
      send(res, found ? 200 : 404, found ? { ok: true } : { ok: false, error: 'report not found' });
      return;
    }

    // ESP8266 relay of a report submitted on the portal.
    if (req.headers['x-bottlenet-key'] !== KEY) { send(res, 401, { ok: false, error: 'unauthorized' }); return; }
    const { error, report } = normalize(body);
    if (error) { send(res, 400, { ok: false, error }); return; }
    const saved = await addReport(report);
    // Awaited because the serverless function may stop once it responds. A retried relay
    // (same ref) only re-sends the email if the first attempt did not go out.
    let emailed = !!saved.emailedAt;
    if (!emailed) {
      emailed = (await sendReportEmail(saved)).sent;
      if (emailed) await markReportEmailed(saved.id);
    }
    send(res, 200, { ok: true, id: saved.id, emailed });
    return;
  }

  send(res, 405, { ok: false, error: 'GET or POST only' });
};
