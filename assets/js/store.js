/* BottleNet admin store — empty until live device data arrives. */
(() => {
    const KEY = 'bottlenet-admin-live-v1';
    const SIZES = {
        large: { label: '1L bottle', short: '1L', minutes: 10, minWeight: 24, maxWeight: 45 },
        mismo: { label: 'Mismo size', short: 'Mismo', minutes: 7, minWeight: 17, maxWeight: 24 },
        sakto: { label: 'Sakto size', short: 'Sakto', minutes: 5, minWeight: 10, maxWeight: 17 }
    };
    const empty = () => ({
        rate: 10,
        sizes: JSON.parse(JSON.stringify(SIZES)),
        minWeight: 10,
        maxWeight: 70,
        bin: 0,
        station: 'offline',
        bottles: 0,
        sessionBottles: 0,
        lastReward: 0,
        expiresAt: 0,
        sessionTotal: 0,
        depositOwner: null,
        depositUntil: 0,
        transactions: [],
        sessions: [],
        collections: [0, 0, 0, 0, 0, 0, 0],
        armed: true,
        sensors: { lid: 'ok', tamper: 'ok', door: 'ok', weight: 'ok', power: 'ok' },
        notify: { email: false, sms: false, siren: false },
        alarms: [],
        mode: 'live',
        stationId: 'BN-001',
        stationName: 'BottleNet station',
        trashLevel: 'NOT FULL',
        trashDistanceCm: 0,
        lastBottle: 'None',
        lastWeightG: 0,
        lastResult: 'Waiting',
        lastResultKind: 'waiting',
        deviceOnline: false,
        updatedAt: 0
    });
    let fallback = empty();
    function get() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) return Object.assign(empty(), JSON.parse(raw));
        } catch { }
        return fallback;
    }
    function save(data) {
        fallback = data;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { }
        window.dispatchEvent(new Event('bottlenet-change'));
        return data;
    }
    function reset() { return save(empty()); }
    function update(fn) { const data = get(); fn(data); return save(data); }
    function time(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    window.BottleNet = { get, save, reset, update, time, SIZES };
})();
