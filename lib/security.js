/* ESP32 security device store: latest sensor status + event log (Neon, /tmp fallback). */
const { dbUrl } = require('./store');

const STORE_PATH = '/tmp/bottlenet-security.json';
const ROW_ID = 'esp32';
const OFFLINE_MS = 20000;
const MAX_TMP_EVENTS = 200;

const LEVELS = { motion: 'warning', tamper: 'critical', device_offline: 'warning', device_online: 'info', device_restart: 'info' };

let tablesReady = false;

async function withSql(fn) {
  const url = dbUrl();
  if (!url) return null;
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  if (!tablesReady) {
    await sql`
      CREATE TABLE IF NOT EXISTS bottlenet_security_status (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bottlenet_security_events (
        id BIGSERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        acked BOOLEAN NOT NULL DEFAULT FALSE,
        acked_at TIMESTAMPTZ,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS bottlenet_security_events_started ON bottlenet_security_events (started_at DESC)`;
    tablesReady = true;
  }
  return fn(sql);
}

/* ---------- ephemeral fallback (no DATABASE_URL) ---------- */

function readTmp() {
  try {
    const fs = require('fs');
    if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (_) {}
  return globalThis.__bottlenetSecurity || { status: null, events: [], nextId: 1 };
}

function writeTmp(mem) {
  if (mem.events.length > MAX_TMP_EVENTS) mem.events.length = MAX_TMP_EVENTS;
  globalThis.__bottlenetSecurity = mem;
  try { require('fs').writeFileSync(STORE_PATH, JSON.stringify(mem)); } catch (_) {}
}

/* Storage adapter so the event logic below is identical for Postgres and /tmp. */
function tmpRepo() {
  const mem = readTmp();
  return {
    async getStatus() { return mem.status; },
    async setStatus(status) { mem.status = status; },
    async insert(type, startedAt, endedAt, meta) {
      const level = LEVELS[type] || 'info';
      const id = mem.nextId++;
      mem.events.unshift({ id, type, level, startedAt, endedAt: endedAt || null, acked: level === 'info', ackedAt: null, meta: meta || {} });
      return id;
    },
    async close(id, endedAt) {
      const e = mem.events.find(x => x.id === id);
      if (e && !e.endedAt) e.endedAt = endedAt;
    },
    async list(limit) { return mem.events.slice(0, limit); },
    async ack(ids, all) {
      const now = Date.now();
      mem.events.forEach(e => { if (!e.acked && (all || ids.includes(e.id))) { e.acked = true; e.ackedAt = now; } });
    },
    async commit() { writeTmp(mem); }
  };
}

function rowToEvent(r) {
  return {
    id: Number(r.id),
    type: r.type,
    level: r.level,
    startedAt: new Date(r.started_at).getTime(),
    endedAt: r.ended_at ? new Date(r.ended_at).getTime() : null,
    acked: !!r.acked,
    ackedAt: r.acked_at ? new Date(r.acked_at).getTime() : null,
    meta: typeof r.meta === 'string' ? JSON.parse(r.meta) : (r.meta || {})
  };
}

function sqlRepo(sql) {
  return {
    async getStatus() {
      const rows = await sql`SELECT payload FROM bottlenet_security_status WHERE id = ${ROW_ID} LIMIT 1`;
      if (!rows.length) return null;
      const p = rows[0].payload;
      return typeof p === 'string' ? JSON.parse(p) : p;
    },
    async setStatus(status) {
      await sql`
        INSERT INTO bottlenet_security_status (id, payload, updated_at)
        VALUES (${ROW_ID}, ${JSON.stringify(status)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `;
    },
    async insert(type, startedAt, endedAt, meta) {
      const level = LEVELS[type] || 'info';
      const rows = await sql`
        INSERT INTO bottlenet_security_events (type, level, started_at, ended_at, acked, meta)
        VALUES (${type}, ${level}, ${new Date(startedAt).toISOString()},
                ${endedAt ? new Date(endedAt).toISOString() : null}, ${level === 'info'},
                ${JSON.stringify(meta || {})}::jsonb)
        RETURNING id
      `;
      return Number(rows[0].id);
    },
    async close(id, endedAt) {
      await sql`UPDATE bottlenet_security_events SET ended_at = ${new Date(endedAt).toISOString()} WHERE id = ${id} AND ended_at IS NULL`;
    },
    async list(limit) {
      const rows = await sql`SELECT * FROM bottlenet_security_events ORDER BY started_at DESC, id DESC LIMIT ${limit}`;
      return rows.map(rowToEvent);
    },
    async ack(ids, all) {
      if (all) await sql`UPDATE bottlenet_security_events SET acked = TRUE, acked_at = NOW() WHERE acked = FALSE`;
      else if (ids.length) await sql`UPDATE bottlenet_security_events SET acked = TRUE, acked_at = NOW() WHERE acked = FALSE AND id = ANY(${ids})`;
    },
    async commit() {}
  };
}

async function run(fn) {
  try {
    const out = await withSql(sql => fn(sqlRepo(sql)));
    if (out !== null) return out;
  } catch (err) {
    console.error('postgres security store failed, falling back to /tmp', err && err.message);
  }
  const repo = tmpRepo();
  const out = await fn(repo);
  await repo.commit();
  return out;
}

const isStale = s => !s || Date.now() - (Number(s.updatedAt) || 0) > OFFLINE_MS;

/* Log a one-off "device offline" event the first time a reader sees the status go stale. */
async function markOfflineIfStale(repo, status) {
  if (!status || !isStale(status) || status.offlineEventId) return status;
  const id = await repo.insert('device_offline', Number(status.updatedAt) + OFFLINE_MS, null, { lastSeen: status.updatedAt });
  const next = Object.assign({}, status, { offlineEventId: id });
  await repo.setStatus(next);
  return next;
}

/* One sensor (motion or tamper): open an event on a rising edge, close it on release,
   and log short triggers that started and ended between two posts (counter went up). */
async function trackSensor(repo, type, active, count, prev, sameBoot, now) {
  const openKey = `${type}EventId`;
  let openId = prev ? prev[openKey] || null : null;
  const missed = sameBoot && prev ? Math.max(0, count - (Number(prev[`${type}Count`]) || 0)) : 0;
  if (active && !openId) {
    openId = await repo.insert(type, now, null, missed > 1 ? { triggers: missed } : {});
  } else if (!active && openId) {
    await repo.close(openId, now);
    openId = null;
  } else if (!active && !openId && missed > 0) {
    await repo.insert(type, now, now, { triggers: missed, brief: true });
  }
  return openId;
}

async function ingest(body) {
  const now = Date.now();
  const motion = !!body.motion;
  const tamper = !!body.tamper;
  return run(async repo => {
    const prev = await repo.getStatus();
    const uptimeMs = Number(body.uptimeMs) || 0;
    const sameBoot = !!prev && uptimeMs >= (Number(prev.uptimeMs) || 0);

    if (prev && prev.offlineEventId) await repo.close(prev.offlineEventId, now);
    if (!prev || isStale(prev)) {
      await repo.insert('device_online', now, null, { ip: body.ip || null, after: prev ? now - Number(prev.updatedAt) : null });
    }
    if (prev && !sameBoot) await repo.insert('device_restart', now, null, { prevUptimeMs: prev.uptimeMs || 0 });

    const status = {
      deviceId: String(body.deviceId || 'SEC-001'),
      motion,
      tamper,
      alarm: body.alarm != null ? !!body.alarm : motion || tamper,
      motionCount: Number(body.motionCount) || 0,
      tamperCount: Number(body.tamperCount) || 0,
      uptimeMs,
      rssi: body.rssi != null ? Number(body.rssi) : null,
      ip: body.ip || null,
      apSsid: body.apSsid || null,
      apIp: body.apIp || null,
      apClients: body.apClients != null ? Number(body.apClients) : null,
      firmware: body.firmware || null,
      updatedAt: now,
      offlineEventId: null
    };
    status.motionEventId = await trackSensor(repo, 'motion', motion, status.motionCount, prev, sameBoot, now);
    status.tamperEventId = await trackSensor(repo, 'tamper', tamper, status.tamperCount, prev, sameBoot, now);
    await repo.setStatus(status);
    return status;
  });
}

async function snapshot(limit) {
  return run(async repo => {
    const status = await markOfflineIfStale(repo, await repo.getStatus());
    const events = await repo.list(limit);
    return { status, events };
  });
}

async function acknowledge(ids, all) {
  return run(repo => repo.ack(ids, all).then(() => true));
}

module.exports = { ingest, snapshot, acknowledge, OFFLINE_MS };
