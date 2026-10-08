/* Portal reports adapter — polls /api/reports for problems users submit on the station's Wi-Fi portal.
   The ESP8266 relays each report from the portal to /api/reports. */
(() => {
    const POLL_MS = 5000;
    /* Problem types offered by the portal's "Report a Problem" form (sent verbatim). */
    const TYPES = {
        'Machine not accepting bottles': 'ban',
        'Bottle stuck': 'package-x',
        'Wi-Fi not working': 'wifi-off',
        'Other': 'message-square'
    };
    const STATUSES = { new: ['New', 'red'], in_progress: ['In progress', 'amber'], resolved: ['Resolved', 'green'] };
    /* connected: null = not checked yet, false = /api/reports is not available, true = live. */
    let data = { loaded: false, connected: null, reports: [] };
    let sig = '';
    let timer = null;

    const get = () => data;
    const typeIcon = type => TYPES[type] || TYPES.Other;
    const status = key => STATUSES[key] || STATUSES.new;
    const unread = () => data.reports.filter(r => (r.status || 'new') === 'new');

    function emit() { window.dispatchEvent(new Event('bottlenet-reports')); }

    async function poll() {
        try {
            const res = await fetch('/api/reports?limit=500', { cache: 'no-store', headers: { Accept: 'application/json' } });
            if (res.status === 404) { setData(Object.assign({}, data, { loaded: true, connected: false })); return; }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            if (!json || !json.ok) throw new Error('bad response');
            const reports = (Array.isArray(json.reports) ? json.reports : []).slice().sort((a, b) => b.createdAt - a.createdAt);
            setData({ loaded: true, connected: true, reports, storage: json.storage });
        } catch {
            setData(Object.assign({}, data, { loaded: true, connected: data.connected === true }));
        }
    }

    function setData(next) {
        const nextSig = JSON.stringify([next.connected, next.storage, next.reports]);
        data = next;
        if (nextSig !== sig) { sig = nextSig; emit(); }
    }

    /* Updates the local copy immediately, then saves it on the server when the reports API is reachable. */
    async function setStatus(id, next) {
        const reports = data.reports.map(r => r.id === id ? Object.assign({}, r, { status: next, updatedAt: Date.now() }) : r);
        setData(Object.assign({}, data, { reports }));
        if (!data.connected) return false;
        const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', id, status: next }) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await poll();
        return true;
    }

    function start() { poll(); clearInterval(timer); timer = setInterval(poll, POLL_MS); }

    window.BottleNetReports = { get, poll, setStatus, unread, typeIcon, status, TYPES, STATUSES };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
