/* Live device adapter — Vercel /api/status (ESP8266 ingest). No SoftAP mock. */
(() => {
    const POLL_MS = 2000;
    let live = false;
    let timer = null;
    let lastKey = null;

    function isLive() { return live; }

    function binFromTrash(level) {
        const t = String(level || '').toUpperCase();
        if (t === 'FULL') return 95;
        if (t === 'HALF FULL' || t === 'HALF') return 65;
        return 20;
    }

    function sizeKeyFromBottle(name) {
        const n = String(name || '').toUpperCase();
        if (n.includes('1L') || n.includes('COKE 1')) return 'large';
        if (n.includes('MISMO')) return 'mismo';
        if (n.includes('SAKTO')) return 'sakto';
        return null;
    }

    function setLive(next) {
        if (live === next) return;
        live = next;
        try {
            window.BottleNet.update(s => {
                s.mode = 'live';
                s.deviceOnline = next;
                if (!next) s.station = 'offline';
            });
        } catch { }
        window.dispatchEvent(new CustomEvent('bottlenet-mode', { detail: { live: next } }));
        updateBadges();
    }

    function updateBadges() {
        document.querySelectorAll('#mode-badge').forEach(el => {
            el.textContent = live ? 'Live' : 'Waiting';
            el.className = `mode-badge ${live ? 'live' : 'offline'}`;
            el.title = live ? 'Receiving ESP8266 status' : 'No recent device push — check board Wi‑Fi/internet';
        });
        const ws = document.getElementById('workspace-badge');
        if (ws) {
            ws.textContent = live ? 'Live ESP8266' : 'Waiting for ESP8266';
            ws.className = live ? 'badge green' : 'badge';
        }
        const foot = document.getElementById('updated-label');
        if (foot) foot.textContent = live ? 'Live from ESP8266' : 'Waiting for device ingest';
    }

    function applyStatus(status) {
        const store = window.BottleNet;
        const rem = Math.max(0, Number(status.wifiRemainingMs) || 0);
        const result = String(status.lastResult || 'Waiting');
        const bottle = status.lastBottle != null ? String(status.lastBottle) : 'None';
        const weight = Number(status.lastWeightG) || 0;
        const key = `${bottle}|${weight}|${result}|${rem}`;
        const isDecision = result === 'ACCEPTED' || result === 'REJECTED';
        const seenAt = Number(status.updatedAt) || Date.now();
        const fresh = Date.now() - seenAt < 30000; // 30s window

        if (!fresh) {
            setLive(false);
            return;
        }
        setLive(true);

        store.update(s => {
            s.mode = 'live';
            s.deviceOnline = true;
            s.updatedAt = seenAt;
            s.stationId = status.stationId || s.stationId;
            s.stationName = status.stationName || s.stationName;
            s.trashLevel = status.trashLevel || s.trashLevel;
            s.trashDistanceCm = Number(status.trashDistanceCm) || 0;
            s.lastBottle = bottle;
            s.lastWeightG = weight;
            s.lastResult = result;
            s.bin = binFromTrash(status.trashLevel);
            s.expiresAt = rem > 0 ? Date.now() + rem : 0;
            s.sessionTotal = rem > 0 ? rem : 0;
            if (status.online === false) s.station = 'offline';
            else if (String(status.trashLevel || '').toUpperCase() === 'FULL') s.station = 'full';
            else s.station = 'ready';

            if (status.rates) {
                if (status.rates.coke1l != null && s.sizes.large) s.sizes.large.minutes = Number(status.rates.coke1l) || s.sizes.large.minutes;
                if (status.rates.mismo != null && s.sizes.mismo) s.sizes.mismo.minutes = Number(status.rates.mismo) || s.sizes.mismo.minutes;
                if (status.rates.sakto != null && s.sizes.sakto) s.sizes.sakto.minutes = Number(status.rates.sakto) || s.sizes.sakto.minutes;
                s.rate = s.sizes.large ? s.sizes.large.minutes : s.rate;
            }

            if (isDecision && key !== lastKey) {
                const sizeKey = sizeKeyFromBottle(bottle);
                const minutes = result === 'ACCEPTED'
                    ? (sizeKey && s.sizes[sizeKey] ? s.sizes[sizeKey].minutes : Number(status.wifiMinutesAwarded) || 0)
                    : 0;
                const accepted = result === 'ACCEPTED';
                s.transactions.unshift({
                    id: `BN-${Date.now()}`,
                    time: Date.now(),
                    session: 'ESP8266',
                    weight,
                    accepted,
                    minutes,
                    size: accepted ? sizeKey : null
                });
                if (s.transactions.length > 50) s.transactions.length = 50;
                if (accepted) {
                    s.lastReward = minutes;
                    s.sessionBottles = (Number(s.sessionBottles) || 0) + 1;
                    s.bottles = (Number(s.bottles) || 0) + 1;
                    if (Array.isArray(s.collections) && s.collections.length)
                        s.collections[s.collections.length - 1] = s.bottles;
                } else {
                    s.lastReward = 0;
                }
            }
        });
        if (isDecision) lastKey = key;
    }

    async function poll() {
        try {
            const res = await fetch('/api/status', { cache: 'no-store', headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data || !data.ok || !data.status) {
                setLive(false);
                return;
            }
            applyStatus(data.status);
        } catch {
            setLive(false);
        }
    }

    function start() {
        updateBadges();
        poll();
        clearInterval(timer);
        timer = setInterval(poll, POLL_MS);
    }

    window.BottleNetDevice = { isLive, start, poll };
    if (window.BottleNet) {
        window.BottleNet.isLive = isLive;
        window.BottleNet.getMode = () => (live ? 'live' : 'waiting');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
