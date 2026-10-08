/* Emails each new portal report to station staff over Gmail SMTP (needs SMTP_USER + SMTP_PASS). */
const TO = process.env.REPORT_EMAIL_TO || 'bottlenet3@gmail.com';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://bottlenet-admin.vercel.app/';

let transport = null;

function mailer() {
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (Number(process.env.SMTP_PORT) || 465) === 465,
      auth: { user, pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000
    });
  }
  return transport;
}

const escape = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function duration(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

/* Label/value pairs shared by the plain-text and HTML bodies. */
function facts(r) {
  const m = r.machine || {};
  const bottle = m.lastBottle && m.lastBottle !== 'None'
    ? `${m.lastBottle} · ${m.lastResult || '—'}${m.lastWeightG != null ? ` · ${m.lastWeightG} g` : ''}`
    : 'None yet';
  return [
    ['Station', [r.stationName, r.stationId && `(${r.stationId})`].filter(Boolean).join(' ') || '—'],
    ['Received', new Date(r.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })],
    ['Device MAC', r.deviceMac || '—'],
    ['IP address', r.ip || '—'],
    ['Last bottle', bottle],
    ['Collection bin', m.trashLevel ? `${m.trashLevel}${m.trashDistanceCm ? ` · ${m.trashDistanceCm} cm` : ''}` : '—'],
    ['Scale', m.scaleReady == null ? '—' : m.scaleReady ? 'Ready' : 'Not detected'],
    ['Wi-Fi time left', m.wifiRemainingMs != null ? duration(m.wifiRemainingMs) : '—'],
    ['Report ID', r.id]
  ];
}

function compose(r) {
  const list = facts(r);
  const description = r.description || 'No description provided.';
  const subject = `[BottleNet] ${r.type}${r.stationId ? ` · ${r.stationId}` : ''}`;
  const text = [`New problem report: ${r.type}`, '', description, '', ...list.map(([k, v]) => `${k}: ${v}`), '', `Review it in the admin dashboard: ${DASHBOARD_URL}`].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#202c29">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;color:#74807b">BOTTLENET PROBLEM REPORT</p>
<h2 style="margin:0 0 14px;font-size:20px">${escape(r.type)}</h2>
<p style="margin:0 0 18px;padding:12px 14px;background:#f6f8f6;border-left:3px solid #c0544b;white-space:pre-wrap">${escape(description)}</p>
<table style="border-collapse:collapse;font-size:13px;width:100%">${list.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#74807b;white-space:nowrap">${escape(k)}</td><td style="padding:6px 0;font-weight:600">${escape(v)}</td></tr>`).join('')}</table>
<p style="margin:20px 0 0"><a href="${escape(DASHBOARD_URL)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#147653;color:#fff;text-decoration:none;font-weight:700">Open the Reports tab</a></p>
</div>`;
  return { subject, text, html };
}

/* Never throws: a mail failure must not lose the report, which is already saved. */
async function sendReportEmail(report) {
  const t = mailer();
  if (!t) return { sent: false, reason: 'SMTP_USER / SMTP_PASS not set' };
  try {
    const { subject, text, html } = compose(report);
    await t.sendMail({ from: `"BottleNet Station" <${process.env.SMTP_USER}>`, to: TO, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('report email failed', err && err.message);
    return { sent: false, reason: 'send failed' };
  }
}

module.exports = { sendReportEmail, compose };
