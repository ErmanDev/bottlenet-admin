/* Portal reports adapter — polls /api/reports for issues users submit from the Wi-Fi portal.
   Until the portal and API are wired up, the endpoint is missing and the dashboard shows an empty inbox. */
(() => {
    const POLL_MS = 5000;
    const CATEGORIES = {
        no_internet: ['No internet', 'wifi-off'],
        time_not_credited: ['Time not credited', 'timer-off'],
        bottle_rejected: ['Bottle rejected', 'ban'],
        machine_issue: ['Machine issue', 'wrench'],
        bin_full: ['Bin full', 'trash-2'],
        other: ['Other', 'message-square']
    };
    const STATUSES = { new: ['New', 'red'], in_progress: ['In progress', 'amber'], resolved: ['Resolved', 'green'] };
    /* connected: null = not checked yet, false = /api/reports is not available, true = live. */
    let data = { loaded: false, connected: null, reports: [] };
    let sig = '';
    let timer = null;

    const get = () => data;
    const category = key => CATEGORIES[key] || CATEGORIES.other;
    const status = key => STATUSES[key] || STATUSES.new;
    const unread = () => data.reports.filter(r => (r.status || 'new') === 'new');

    function emit() { window.dispatchEvent(new Event('bottlenet-reports')); }

    async function poll() {
        try {
            const res = await fetch('/api/reports?limit=500', { cache: 'no-store', headers: { Accept: 'application/json' } });
            if (res.status === 404) { stop(); setData({ loaded: true, connected: false, reports: data.reports }); return; }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            if (!json || !json.ok) throw new Error('bad response');
            const reports = (Array.isArray(json.reports) ? json.reports : []).slice().sort((a, b) => b.createdAt - a.createdAt);
            setData({ loaded: true, connected: true, reports });
        } catch {
            setData({ loaded: true, connected: data.connected === true ? true : false, reports: data.reports });
        }
    }

    function setData(next) {
        const nextSig = JSON.stringify([next.connected, next.reports]);
        data = next;
        if (nextSig !== sig) { sig = nextSig; emit(); }
    }

    /* Updates the local copy immediately; persists once the reports API exists. */
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
    function stop() { clearInterval(timer); timer = null; }

    window.BottleNetReports = { get, poll, setStatus, unread, category, status, CATEGORIES, STATUSES };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
