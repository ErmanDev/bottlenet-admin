/* Portal problem reports, relayed by the ESP8266 station (Neon, /tmp fallback). */
const { dbUrl } = require('./store');

const STORE_PATH = '/tmp/bottlenet-reports.json';
const MAX_TMP_REPORTS = 500;
const TYPES = ['Machine not accepting bottles', 'Bottle stuck', 'Wi-Fi not working', 'Other'];
const STATUSES = ['new', 'in_progress', 'resolved'];
const MAX_DESCRIPTION = 500;

let tableReady = false;

async function withSql(fn) {
  const url = dbUrl();
  if (!url) return null;
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  if (!tableReady) {
    await sql`
      CREATE TABLE IF NOT EXISTS bottlenet_reports (
        id BIGSERIAL PRIMARY KEY,
        ref TEXT UNIQUE,
        type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        station_id TEXT,
        station_name TEXT,
        device_mac TEXT,
        ip TEXT,
        machine JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        emailed_at TIMESTAMPTZ
      )
    `;
    await sql`ALTER TABLE bottlenet_reports ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ`;
    await sql`CREATE INDEX IF NOT EXISTS bottlenet_reports_created ON bottlenet_reports (created_at DESC)`;
    tableReady = true;
  }
  return fn(sql);
}

/* ---------- ephemeral fallback (no DATABASE_URL) ---------- */

function readTmp() {
  try {
    const fs = require('fs');
    if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (_) {}
  return globalThis.__bottlenetReports || { reports: [], nextId: 1 };
}

function writeTmp(mem) {
  if (mem.reports.length > MAX_TMP_REPORTS) mem.reports.length = MAX_TMP_REPORTS;
  globalThis.__bottlenetReports = mem;
  try { require('fs').writeFileSync(STORE_PATH, JSON.stringify(mem)); } catch (_) {}
}

function tmpRepo() {
  const mem = readTmp();
  return {
    async insert(r) {
      if (r.ref) {
        const dup = mem.reports.find(x => x.ref === r.ref);
        if (dup) return dup;
      }
      const saved = Object.assign({ id: mem.nextId++, status: 'new', updatedAt: null, emailedAt: null }, r);
      mem.reports.unshift(saved);
      return saved;
    },
    async list(limit) { return mem.reports.slice(0, limit); },
    async setStatus(id, status) {
      const r = mem.reports.find(x => x.id === id);
      if (r) { r.status = status; r.updatedAt = Date.now(); }
      return !!r;
    },
    async markEmailed(id) {
      const r = mem.reports.find(x => x.id === id);
      if (r) r.emailedAt = Date.now();
    },
    async commit() { writeTmp(mem); }
  };
}

function rowToReport(r) {
  return {
    id: Number(r.id),
    ref: r.ref || null,
    type: r.type,
    description: r.description || '',
    status: r.status,
    stationId: r.station_id || null,
    stationName: r.station_name || null,
    deviceMac: r.device_mac || null,
    ip: r.ip || null,
    machine: typeof r.machine === 'string' ? JSON.parse(r.machine) : (r.machine || {}),
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    emailedAt: r.emailed_at ? new Date(r.emailed_at).getTime() : null
  };
}

function sqlRepo(sql) {
  return {
    async insert(r) {
      // A retried relay (same ref) returns the stored report instead of duplicating it.
      const rows = await sql`
        INSERT INTO bottlenet_reports (ref, type, description, station_id, station_name, device_mac, ip, machine, created_at)
        VALUES (${r.ref}, ${r.type}, ${r.description}, ${r.stationId}, ${r.stationName}, ${r.deviceMac}, ${r.ip},
                ${JSON.stringify(r.machine)}::jsonb, ${new Date(r.createdAt).toISOString()})
        ON CONFLICT (ref) DO UPDATE SET ref = EXCLUDED.ref
        RETURNING *
      `;
      return rowToReport(rows[0]);
    },
    async list(limit) {
      const rows = await sql`SELECT * FROM bottlenet_reports ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
      return rows.map(rowToReport);
    },
    async setStatus(id, status) {
      const rows = await sql`UPDATE bottlenet_reports SET status = ${status}, updated_at = NOW() WHERE id = ${id} RETURNING id`;
      return rows.length > 0;
    },
    async markEmailed(id) {
      await sql`UPDATE bottlenet_reports SET emailed_at = NOW() WHERE id = ${id}`;
    },
    async commit() {}
  };
}

async function run(fn) {
  try {
    const out = await withSql(sql => fn(sqlRepo(sql)));
    if (out !== null) return out;
  } catch (err) {
    console.error('postgres reports store failed, falling back to /tmp', err && err.message);
  }
  const repo = tmpRepo();
  const out = await fn(repo);
  await repo.commit();
  return out;
}

const str = (v, max) => (v == null ? null : String(v).slice(0, max) || null);
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/* Validates an ESP8266 relay body. Returns { error } or { report }. */
function normalize(body) {
  const type = String(body.type || '').trim();
  if (!TYPES.includes(type)) return { error: 'unknown report type' };
  const m = body.machine && typeof body.machine === 'object' ? body.machine : {};
  // The station has no real-time clock, so it reports how long the report waited in its queue.
  const ageMs = Math.min(7 * 864e5, Math.max(0, num(body.ageMs) || 0));
  return {
    report: {
      ref: str(body.ref, 64),
      type,
      description: String(body.description || '').trim().slice(0, MAX_DESCRIPTION),
      stationId: str(body.stationId, 32),
      stationName: str(body.stationName, 64),
      deviceMac: str(body.deviceMac, 17),
      ip: str(body.ip, 15),
      machine: {
        lastBottle: str(m.lastBottle, 24),
        lastResult: str(m.lastResult, 16),
        lastWeightG: num(m.lastWeightG),
        trashLevel: str(m.trashLevel, 16),
        trashDistanceCm: num(m.trashDistanceCm),
        wifiRemainingMs: num(m.wifiRemainingMs),
        scaleReady: m.scaleReady == null ? null : !!m.scaleReady,
        apClients: num(m.apClients),
        uptimeS: num(m.uptimeS)
      },
      createdAt: Date.now() - ageMs
    }
  };
}

async function addReport(report) {
  return run(repo => repo.insert(report));
}

async function listReports(limit) {
  return run(repo => repo.list(limit));
}

async function setReportStatus(id, status) {
  return run(repo => repo.setStatus(id, status));
}

async function markReportEmailed(id) {
  return run(repo => repo.markEmailed(id));
}

module.exports = { normalize, addReport, listReports, setReportStatus, markReportEmailed, TYPES, STATUSES };
