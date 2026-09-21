const STORE_PATH = '/tmp/bottlenet-status.json';
const ROW_ID = 'latest';

function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function readTmp() {
  try {
    const fs = require('fs');
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    }
  } catch (_) {}
  return globalThis.__bottlenetStatus || null;
}

function writeTmp(mem) {
  globalThis.__bottlenetStatus = mem;
  try {
    const fs = require('fs');
    fs.writeFileSync(STORE_PATH, JSON.stringify(mem));
  } catch (_) {}
  return mem;
}

function normalizeBody(body) {
  const now = Date.now();
  if (body && body.status && typeof body.status === 'object') {
    const status = Object.assign({}, body.status, { updatedAt: now });
    return { ok: true, status };
  }
  const flat = Object.assign({}, body || {});
  delete flat.ok;
  flat.updatedAt = now;
  return { ok: true, status: flat };
}

async function withSql(fn) {
  const url = dbUrl();
  if (!url) return null;
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  await sql`
    CREATE TABLE IF NOT EXISTS bottlenet_status (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  return fn(sql);
}

async function readStatus() {
  try {
    const fromDb = await withSql(async (sql) => {
      const rows = await sql`SELECT payload FROM bottlenet_status WHERE id = ${ROW_ID} LIMIT 1`;
      if (!rows || !rows.length) return null;
      const payload = rows[0].payload;
      return typeof payload === 'string' ? JSON.parse(payload) : payload;
    });
    if (fromDb) {
      globalThis.__bottlenetStatus = fromDb;
      return fromDb;
    }
  } catch (err) {
    console.error('postgres readStatus failed, falling back to /tmp', err && err.message);
  }
  return readTmp();
}

async function writeStatus(body) {
  const mem = normalizeBody(body);
  try {
    const ok = await withSql(async (sql) => {
      await sql`
        INSERT INTO bottlenet_status (id, payload, updated_at)
        VALUES (${ROW_ID}, ${JSON.stringify(mem)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE
        SET payload = EXCLUDED.payload, updated_at = NOW()
      `;
      return true;
    });
    if (ok) {
      globalThis.__bottlenetStatus = mem;
      return mem;
    }
  } catch (err) {
    console.error('postgres writeStatus failed, falling back to /tmp', err && err.message);
  }
  return writeTmp(mem);
}

module.exports = { readStatus, writeStatus, dbUrl };
