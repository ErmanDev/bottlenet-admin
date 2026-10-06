/* ESP32 security device adapter — polls /api/security (status + event log). */
(() => {
    const POLL_MS = 2000;
    const TYPES = {
        motion: ['Motion detected', 'IR sensor picked up movement near the station.'],
        tamper: ['Theft attempt', 'Brake switch released — someone may be moving or opening the station.'],
        device_offline: ['Security device offline', 'No update from the ESP32 security unit.'],
        device_online: ['Security device online', 'ESP32 security unit connected and reporting.'],
        device_restart: ['Security device restarted', 'ESP32 rebooted (power loss or reset).']
    };
    let data = { loaded: false, online: false, status: null, events: [], offset: 0, offlineAfterMs: 20000 };
    let sig = '';
    let timer = null;

    const get = () => data;
    const now = () => Date.now() + data.offset;
    const openAlarms = () => data.events.filter(e => !e.acked && e.level !== 'info');
    const describe = type => TYPES[type] || [type, ''];

    function emit() { window.dispatchEvent(new Event('bottlenet-security')); }

    async function poll() {
        try {
            const res = await fetch('/api/security?limit=200', { cache: 'no-store', headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            if (!json || !json.ok) throw new Error('bad response');
            const next = {
                loaded: true,
                online: !!json.online,
                status: json.status || null,
                events: Array.isArray(json.events) ? json.events : [],
                offset: (Number(json.serverTime) || Date.now()) - Date.now(),
                offlineAfterMs: Number(json.offlineAfterMs) || 20000,
                storage: json.storage
            };
            const nextSig = JSON.stringify([next.online, next.status, next.events]);
            data = next;
            if (nextSig !== sig) { sig = nextSig; emit(); }
        } catch {
            if (data.online || !data.loaded) { data = Object.assign({}, data, { loaded: true, online: false }); sig = ''; emit(); }
        }
    }

    async function ack(ids) {
        const body = ids === 'all' ? { action: 'ack', all: true } : { action: 'ack', ids: [].concat(ids) };
        const res = await fetch('/api/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await poll();
    }

    function start() { poll(); clearInterval(timer); timer = setInterval(poll, POLL_MS); }

    window.BottleNetSecurity = { get, now, openAlarms, describe, ack, poll, TYPES };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
