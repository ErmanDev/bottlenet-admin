(() => {
    const $ = id => document.getElementById(id), store = window.BottleNet, inputs = [...document.querySelectorAll('.pin-fields input')];
    const live = () => typeof store.isLive === 'function' ? store.isLive() : (window.BottleNetDevice && typeof window.BottleNetDevice.isLive === 'function' ? window.BottleNetDevice.isLive() : store.get().mode === 'live');
    const stationLabel = d => d.stationName || 'Campus station 01';
    const stationCode = d => d.stationId || 'BN-001';
    let tab = 'overview', filter = 'all', query = '';
    let unlocked = false;
    try {
        unlocked = sessionStorage.getItem('bottlenet-admin') === 'yes';
    }
    catch { }
    /* Presentation only: the mockup board opens the dashboard directly. Not authentication. */
    if (new URLSearchParams(location.search).get('unlock') === '1')
        unlocked = true;
    function show() { $('login-view').hidden = unlocked; $('dashboard-view').hidden = !unlocked; if (unlocked)
        render();
    else
        inputs[0].focus(); }
    inputs.forEach((input, i) => { input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(-1); $('pin-error').textContent = ''; if (input.value && i < 3)
        inputs[i + 1].focus(); }; input.onkeydown = e => { if (e.key === 'Backspace' && !input.value && i > 0)
        inputs[i - 1].focus(); if (e.key === 'ArrowLeft' && i > 0)
        inputs[i - 1].focus(); if (e.key === 'ArrowRight' && i < 3)
        inputs[i + 1].focus(); }; input.onpaste = e => { e.preventDefault(); const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4); [...digits].forEach((n, j) => inputs[j].value = n); inputs[Math.min(digits.length, 3)].focus(); }; });
    $('pin-form').onsubmit = e => { e.preventDefault(); if (inputs.map(i => i.value).join('') === '1234') {
        unlocked = true;
        try {
            sessionStorage.setItem('bottlenet-admin', 'yes');
        }
        catch { }
        show();
    }
    else {
        $('pin-error').textContent = 'Incorrect PIN. Please try again.';
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
    } };
    function signOut() { unlocked = false; try {
        sessionStorage.removeItem('bottlenet-admin');
    }
    catch { } inputs.forEach(i => i.value = ''); show(); }
    $('sign-out').onclick = signOut;
    const themeToggle = $('theme-toggle');
    if (themeToggle) {
        const applyThemeIcon = () => {
            const dark = document.documentElement.getAttribute('data-theme') === 'dark';
            themeToggle.setAttribute('aria-pressed', String(dark));
            themeToggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
            themeToggle.setAttribute('aria-label', themeToggle.title);
            themeToggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
            if (window.lucide) window.lucide.createIcons();
        };
        applyThemeIcon();
        window.addEventListener('icons-ready', applyThemeIcon);
        themeToggle.onclick = () => {
            const dark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (dark) document.documentElement.removeAttribute('data-theme');
            else document.documentElement.setAttribute('data-theme', 'dark');
            try { localStorage.setItem('bottlenet-theme', dark ? 'light' : 'dark'); } catch { }
            applyThemeIcon();
        };
    }
    const descriptions = { overview: ['Station overview', 'A live look at your station and its impact.'], transactions: ['Transactions', 'Every bottle and every connection, accounted for.'], sessions: ['Active sessions', 'Manage the connections your station makes possible.'], machine: ['Machine status', 'Station health, collection capacity, and maintenance.'], security: ['Security and alarms', 'Live motion and anti-theft monitoring from the ESP32 security unit.'], settings: ['Station settings', 'Manage bottle acceptance and connection rewards.'] };
    const badge = (text, color = 'green') => `<span class="badge ${color}">${text}</span>`;
    const sec = window.BottleNetSecurity;
    let secFilter = 'all';
    const escape = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const fmtStamp = ms => new Date(ms).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    function fmtDur(ms) {
        const s = Math.max(0, Math.round(ms / 1000));
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60), h = Math.floor(m / 60);
        return h ? `${h}h ${m % 60}m` : `${m}m ${s % 60}s`;
    }
    const ago = ms => ms ? `${fmtDur(sec.now() - ms)} ago` : '—';
    const metric = (label, value, foot) => `<div class="metric"><div class="metric-label">${label}<span>↗</span></div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></div>`;
    function rows(transactions) { return transactions.length ? transactions.map(t => `<tr><td>${t.id}</td><td>${new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>${t.session}</td><td>${t.size && store.get().sizes[t.size] ? store.get().sizes[t.size].label : '—'}</td><td>${t.weight.toFixed(1)} g</td><td>${badge(t.accepted ? 'Accepted' : 'Rejected', t.accepted ? 'green' : 'red')}</td><td>${t.minutes ? `+${t.minutes} min` : '—'}</td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">No matching transactions.</td></tr>'; }
    const table = transactions => `<div class="table-wrap"><table><thead><tr><th>TRANSACTION</th><th>TIME</th><th>SESSION</th><th>BOTTLE</th><th>WEIGHT</th><th>RESULT</th><th>TIME AWARDED</th></tr></thead><tbody id="transaction-rows">${rows(transactions)}</tbody></table></div>`;
    function navigate(next) { tab = next; query = ''; filter = 'all'; $('admin-toast').textContent = ''; render(); }
    $('admin-nav').onclick = e => { const b = e.target.closest('[data-tab]'); if (b)
        navigate(b.dataset.tab); };
    function render() {
        if (!unlocked)
            return;
        const d = store.get(), active = d.sessions.filter(s => s.expiresAt > Date.now()), own = d.expiresAt > Date.now();
        const on = live();
        renderHeaderStatus();
        const sideName = $('sidebar-station-name');
        if (sideName) sideName.textContent = stationLabel(d);
        $('breadcrumb').textContent = tab[0].toUpperCase() + tab.slice(1);
        $('page-title').textContent = descriptions[tab][0];
        $('page-description').textContent = descriptions[tab][1];
        const eyebrow = document.querySelector('.page-heading .eyebrow');
        if (eyebrow) eyebrow.textContent = stationLabel(d).toUpperCase();
        document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        $('sidebar-status').textContent = d.station === 'ready' ? 'Station online' : d.station[0].toUpperCase() + d.station.slice(1);
        renderAlarmChrome();
        if (tab === 'overview') {
            $('admin-content').innerHTML = `<section class="metrics">${metric('Bottles collected today', d.bottles, 'Collected for a better tomorrow')}${metric('Active connections', active.length + Number(own), 'Devices connected right now')}${metric('Minutes awarded today', d.transactions.filter(t => t.accepted).reduce((n, t) => n + (Number(t.minutes)||0), 0), 'More time to stay connected')}${metric('Bin capacity', `${d.bin}%`, d.bin >= 90 ? 'Collection needed' : 'Space for more good habits')}</section><div class="overview-grid"><section class="section-surface"><div class="section-title"><div><h2>A week of small changes</h2><p>Bottles collected over the last 7 days</p></div>${badge('This week')}</div><div class="chart" role="img" aria-label="Daily bottle collection: ${d.collections.join(', ')}">${d.collections.map((n, i) => `<div class="chart-column"><div class="chart-bar" style="height:${n / Math.max(...d.collections) * 115}px" title="${n} bottles"></div><span>${['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Today'][i]}</span></div>`).join('')}</div><div class="chart-footer"><span>Every bottle makes a difference</span><strong>${d.collections.reduce((a, b) => a + b, 0)} bottles</strong></div></section><section class="section-surface"><div class="section-title"><h2>Your station</h2>${badge(d.station === 'ready' ? 'Online' : d.station, d.station === 'ready' ? 'green' : 'amber')}</div><div class="machine-summary"><div class="machine-summary-row"><span>${stationLabel(d)}</span><span class="muted">${stationCode(d)}</span></div><div class="machine-summary-row"><span>Collection bin</span><strong>${d.bin}% full${d.trashLevel ? ` · ${d.trashLevel}` : ''}</strong></div>${on ? `<div class="machine-summary-row"><span>Last bottle</span><strong>${d.lastBottle || 'None'} · ${d.lastWeightG || 0} g · ${d.lastResult || 'Waiting'}</strong></div><div class="machine-summary-row"><span>Wi-Fi remaining</span><strong>${store.time(Math.max(0, d.expiresAt - Date.now()))}</strong></div>` : ''}<div class="progress-track"><div class="progress-fill" style="width:${d.bin}%"></div></div><p>${d.bin >= 90 ? 'Ready for collection' : 'Collection capacity available'}</p><button class="button secondary full" id="view-machine">View machine details →</button></div></section></div><section class="section-surface"><div class="section-title"><div><h2>Recent transactions</h2><p>The latest activity at your station</p></div><button class="text-button" id="view-transactions">View all →</button></div>${table(d.transactions.slice(0, 5))}</section>`;
            $('view-machine').onclick = () => navigate('machine');
            $('view-transactions').onclick = () => navigate('transactions');
        }
        if (tab === 'transactions') {
            $('admin-content').innerHTML = `<section class="section-surface"><div class="table-toolbar"><input id="transaction-search" class="field" placeholder="Search transaction or session" aria-label="Search transactions"><select id="transaction-filter" aria-label="Filter result"><option value="all">All results</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></div>${table(d.transactions)}</section>`;
            $('transaction-search').value = query;
            $('transaction-filter').value = filter;
            const refresh = () => { $('transaction-rows').innerHTML = rows(store.get().transactions.filter(t => (filter === 'all' || t.accepted === (filter === 'accepted')) && `${t.id} ${t.session}`.toLowerCase().includes(query.toLowerCase()))); };
            $('transaction-search').oninput = e => { query = e.target.value; refresh(); };
            $('transaction-filter').onchange = e => { filter = e.target.value; refresh(); };
            refresh();
        }
        if (tab === 'sessions') {
            const sessions = [...(own ? [{ id: 'own', name: 'Your device', expiresAt: d.expiresAt, bottles: d.sessionBottles }] : []), ...active];
            $('admin-content').innerHTML = `<section class="section-surface"><div class="section-title"><h2>Connected devices</h2>${badge(`${sessions.length} active`, 'blue')}</div><div class="table-wrap"><table><thead><tr><th>DEVICE</th><th>STATUS</th><th>BOTTLES</th><th>REMAINING</th><th>ACTION</th></tr></thead><tbody>${sessions.map(s => `<tr><td>${s.name}</td><td>${badge('Connected', 'blue')}</td><td>${s.bottles}</td><td data-expiry="${s.expiresAt}">${store.time(s.expiresAt - Date.now())}</td><td><button class="text-button" data-end="${s.id}">End session</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty-state">No active sessions.</td></tr>'}</tbody></table></div></section>`;
            document.querySelectorAll('[data-end]').forEach(b => b.onclick = () => { if (!confirm('End this device\'s mock session?'))
                return; store.update(s => { if (b.dataset.end === 'own')
                s.expiresAt = Date.now();
            else
                s.sessions = s.sessions.filter(x => x.id !== b.dataset.end); }); render(); toast('Session ended.'); });
        }
        if (tab === 'machine') {
            $('admin-content').innerHTML = `<div class="machine-details"><section class="section-surface"><div class="section-title"><h2>Station diagnostics</h2>${badge(on ? 'Live device' : 'Waiting for device', on ? 'green' : undefined)}</div><div class="detail-list"><div><span>Controller</span><strong>ESP8266 / ${stationCode(d)}</strong></div><div><span>Station</span><strong>${stationLabel(d)}</strong></div><div><span>Status</span>${badge(d.station, d.station === 'ready' ? 'green' : 'amber')}</div><div><span>Bin fill level</span><strong>${d.bin}%${d.trashLevel ? ` · ${d.trashLevel}` : ''}${d.trashDistanceCm != null ? ` · ${d.trashDistanceCm} cm` : ''}</strong></div><div><span>Last bottle</span><strong>${on ? `${d.lastBottle || 'None'} · ${d.lastResult || 'Waiting'}` : (d.transactions[0] ? d.transactions[0].id : '—')}</strong></div><div><span>Last bottle weight</span><strong>${on ? `${d.lastWeightG || 0} g` : `${d.transactions[0] ? d.transactions[0].weight : 0} g`}</strong></div><div><span>Wi-Fi remaining</span><strong>${store.time(Math.max(0, d.expiresAt - Date.now()))}</strong></div><div><span>Last reward</span><strong>+${d.lastReward || 0} min</strong></div><div><span>Load cell</span>${badge(on ? 'Device' : 'Operational', on ? 'green' : undefined)}</div><div><span>Internet gateway</span>${badge(on ? 'SoftAP live' : 'Waiting for device', 'blue')}</div></div></section><section class="section-surface"><div class="section-title"><h2>Station controls</h2></div><div class="machine-summary"><div class="form-row"><div><label for="maintenance">Maintenance mode</label><p>Temporarily suspend new deposits.</p></div><input id="maintenance" type="checkbox" class="toggle" ${d.station === 'maintenance' ? 'checked' : ''}></div><div class="form-row"><div><h3>Collection complete</h3><p>Record an emptied collection bin.</p></div><button class="button secondary" id="empty-bin">Empty bin</button></div></div></section></div>`;
            $('maintenance').onchange = e => { store.update(s => { s.station = e.target.checked ? 'maintenance' : s.bin >= 100 ? 'full' : 'ready'; s.depositUntil = 0; }); render(); toast('Station availability updated.'); };
            $('empty-bin').onclick = () => { if (!confirm('Record that the bin has been emptied?'))
                return; store.update(s => { s.bin = 0; if (s.station === 'full')
                s.station = 'ready'; }); render(); toast('Bin collection recorded.'); };
        }
        if (tab === 'security') {
            $('admin-content').innerHTML = `<section id="sec-status" class="sec-status" aria-live="polite"></section><div class="machine-details sec-details"><section class="section-surface"><div class="section-title"><h2>ESP32 security unit</h2><span id="sec-unit-badge"></span></div><div id="sec-diagnostics" class="detail-list"></div></section><section class="section-surface"><div class="section-title"><div><h2>Last 24 hours</h2><p>What the security unit has logged.</p></div></div><div id="sec-summary" class="detail-list"></div></section></div><section class="section-surface"><div class="section-title"><div><h2>Security log</h2><p>Motion, theft attempts, and device connectivity — stored on the server.</p></div><button class="text-button" id="ack-all">Acknowledge all</button></div><div class="table-toolbar"><select id="sec-filter" aria-label="Filter events"><option value="all">All events</option><option value="alarms">Open alarms</option><option value="tamper">Theft attempts</option><option value="motion">Motion</option><option value="device">Device connectivity</option></select></div><div class="table-wrap"><table><thead><tr><th>TIME</th><th>EVENT</th><th>SEVERITY</th><th>DURATION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody id="sec-rows"></tbody></table></div><p id="sec-note" class="muted sec-note"></p></section>`;
            $('sec-filter').value = secFilter;
            $('sec-filter').onchange = e => { secFilter = e.target.value; renderSecurityLive(); };
            $('ack-all').onclick = () => acknowledge('all');
            renderSecurityLive();
        }
        if (tab === 'settings') {
            $('admin-content').innerHTML = `<form id="settings-form" class="settings-form">${Object.entries(d.sizes).map(([key, size]) => `<div class="form-row"><div><label for="minutes-${key}">${size.label}</label><p>Minutes awarded for a ${size.short} bottle (${size.minWeight}–${size.maxWeight} g).</p></div><input class="field" id="minutes-${key}" data-size="${key}" type="number" min="1" max="120" required value="${size.minutes}"></div>`).join('')}<div class="form-row"><div><label for="min-weight">Minimum bottle weight</label><p>Lower acceptance threshold, in grams.</p></div><input class="field" id="min-weight" type="number" min="1" max="200" step="0.1" required value="${d.minWeight}"></div><div class="form-row"><div><label for="max-weight">Maximum bottle weight</label><p>Upper acceptance threshold, in grams.</p></div><input class="field" id="max-weight" type="number" min="1" max="200" step="0.1" required value="${d.maxWeight}"></div><div class="form-row"><div><h3>Administrator PIN</h3><p>Demo PIN is 1234. Production authentication requires a backend.</p></div>${badge('Demo only')}</div><button class="button primary" type="submit">Save changes</button></form>`;
            $('settings-form').onsubmit = e => { e.preventDefault(); const min = Number($('min-weight').value), max = Number($('max-weight').value); if (min >= max) {
                toast('Minimum weight must be less than maximum weight.');
                return;
            } store.update(s => { document.querySelectorAll('[data-size]').forEach(el => { s.sizes[el.dataset.size].minutes = Number(el.value); }); s.rate = s.sizes.large.minutes; s.minWeight = min; s.maxWeight = max; }); toast('Settings saved. New deposits will use the updated reward.'); };
        }
    }
    function toast(text) { $('admin-toast').textContent = text; }
    /* Header badges follow the device behind the current tab: ESP32 on Security, ESP8266 elsewhere. */
    function renderHeaderStatus() {
        document.body.dataset.adminTab = tab;
        let on, label, title, footText;
        if (tab === 'security') {
            const s = sec.get();
            on = s.online;
            label = on ? 'Live ESP32' : s.status ? 'ESP32 offline' : 'Waiting for ESP32';
            title = on ? 'Receiving ESP32 security status' : 'No recent update from the ESP32 security unit';
            footText = on ? 'Live from ESP32 security unit' : 'Waiting for ESP32 security unit';
        } else {
            on = live();
            label = on ? 'Live ESP8266' : 'Waiting for ESP8266';
            title = on ? 'Receiving ESP8266 status' : 'Waiting for ESP8266 ingest';
            footText = on ? 'Live from ESP8266' : 'Waiting for device ingest';
        }
        const modeBadge = $('mode-badge');
        if (modeBadge) { modeBadge.textContent = on ? 'Live' : 'Waiting'; modeBadge.className = `mode-badge ${on ? 'live' : 'demo'}`; modeBadge.title = title; }
        const ws = $('workspace-badge');
        if (ws) { ws.textContent = label; ws.className = on ? 'badge green' : 'badge'; }
        const foot = $('updated-label');
        if (foot) foot.textContent = footText;
    }
    function renderAlarmChrome() {
        const open = sec.openAlarms();
        const s = sec.get(), st = s.status;
        const activeTamper = s.online && st && st.tamper, activeMotion = s.online && st && st.motion;
        const show = open.length || activeTamper || activeMotion;
        const critical = activeTamper || open.some(a => a.level === 'critical');
        $('alarm-banner').hidden = !show;
        $('alarm-banner').dataset.level = critical ? 'critical' : 'warning';
        if (show) {
            const latest = open[0];
            const [title, text] = activeTamper ? sec.describe('tamper') : activeMotion ? sec.describe('motion') : sec.describe(latest.type);
            const when = activeTamper || activeMotion ? 'happening now' : new Date(latest.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            $('alarm-banner-level').textContent = critical ? 'CRITICAL' : 'WARNING';
            $('alarm-banner-title').textContent = title;
            $('alarm-banner-text').textContent = `${text} · ${stationLabel(store.get())} · ${when}${open.length ? ` · ${open.length} open alarm${open.length > 1 ? 's' : ''}` : ''}`;
        }
        const navCount = document.querySelector('[data-tab="security"] .nav-count');
        if (navCount) { navCount.textContent = open.length; navCount.hidden = !open.length; }
    }
    const secCard = (icon, label, value, sub, state) => `<div class="sec-card ${state}"><div class="sec-card-label"><i data-lucide="${icon}"></i>${label}</div><div class="sec-card-value">${value}</div><div class="sec-card-foot">${sub}</div></div>`;
    function securityRows(s) {
        const events = s.events.filter(e => secFilter === 'all' || (secFilter === 'alarms' ? !e.acked && e.level !== 'info' : secFilter === 'device' ? e.type.startsWith('device_') : e.type === secFilter));
        if (!events.length) return `<tr><td colspan="6" class="empty-state">${s.events.length ? 'No matching events.' : 'No security events recorded yet.'}</td></tr>`;
        return events.map(e => {
            const [title, text] = sec.describe(e.type);
            const ongoing = !e.endedAt && (e.type === 'motion' || e.type === 'tamper' || e.type === 'device_offline');
            let duration = '—';
            if (e.meta && e.meta.brief) duration = `Brief${e.meta.triggers > 1 ? ` ×${e.meta.triggers}` : ''}`;
            else if (e.endedAt) duration = fmtDur(e.endedAt - e.startedAt);
            else if (ongoing) duration = s.online || e.type === 'device_offline' ? `<span data-since="${e.startedAt}">${fmtDur(sec.now() - e.startedAt)}</span>` : 'Unknown';
            const sev = e.level === 'critical' ? badge('Critical', 'red') : e.level === 'warning' ? badge('Warning', 'amber') : badge('Info', 'blue');
            const state = e.level === 'info' ? badge('Logged') : e.acked ? badge('Acknowledged', 'green') : badge('Open', 'red');
            const live = ongoing && (s.online || e.type === 'device_offline') ? ` ${badge('Active', 'red')}` : '';
            const extra = e.type === 'device_online' && e.meta && e.meta.ip ? ` · IP ${escape(e.meta.ip)}` : '';
            return `<tr class="alarm-row ${e.level}"><td>${fmtStamp(e.startedAt)}</td><td><strong>${title}</strong><br><span class="muted">${text}${extra}</span></td><td>${sev}</td><td>${duration}</td><td>${state}${live}</td><td>${e.acked || e.level === 'info' ? '—' : `<button class="text-button" data-sec-ack="${e.id}">Acknowledge</button>`}</td></tr>`;
        }).join('');
    }
    function renderSecurityLive() {
        if (!unlocked || tab !== 'security' || !$('sec-status')) return;
        const s = sec.get(), st = s.status, on = s.online;
        const known = on ? '' : st ? ' · last known' : '';
        const idle = !on;
        $('sec-status').innerHTML = [
            secCard('shield', 'Security unit', on ? 'Online' : st ? 'Offline' : 'Waiting', st ? `Last update <span data-ago="${st.updatedAt}">${ago(st.updatedAt)}</span>` : (s.loaded ? 'No data received yet' : 'Connecting…'), on ? 'ok' : st ? 'warn' : 'idle'),
            secCard('radar', 'IR sensor', st ? (st.motion ? 'Motion detected!' : 'No motion') : '—', `GPIO 27${st ? ` · ${st.motionCount} trigger${st.motionCount === 1 ? '' : 's'} since boot` : ''}${known}`, !st ? 'idle' : st.motion ? (idle ? 'warn' : 'alert') : (idle ? 'idle' : 'ok')),
            secCard(st && st.tamper ? 'lock-open' : 'lock', 'Brake switch', st ? (st.tamper ? 'Trying to steal!' : 'Secure') : '—', `GPIO 26${st ? ` · ${st.tamperCount} trigger${st.tamperCount === 1 ? '' : 's'} since boot` : ''}${known}`, !st ? 'idle' : st.tamper ? (idle ? 'warn' : 'alert') : (idle ? 'idle' : 'ok')),
            secCard('siren', 'Buzzer & LED', st ? (st.alarm ? 'Sounding' : 'Silent') : '—', `Buzzer GPIO 25 · LED GPIO 33${known}`, !st ? 'idle' : st.alarm ? (idle ? 'warn' : 'alert') : (idle ? 'idle' : 'ok'))
        ].join('');
        $('sec-unit-badge').innerHTML = badge(on ? 'Online' : st ? 'Offline' : 'Waiting for ESP32', on ? 'green' : st ? 'amber' : undefined);
        const rssi = st && st.rssi != null ? `${st.rssi} dBm · ${st.rssi >= -60 ? 'Strong' : st.rssi >= -72 ? 'Fair' : 'Weak'}` : '—';
        $('sec-diagnostics').innerHTML = [
            ['Device ID', st ? escape(st.deviceId) : '—'],
            ['Firmware', st && st.firmware ? escape(st.firmware) : '—'],
            ['Network IP', st && st.ip ? escape(st.ip) : '—'],
            ['Wi-Fi signal', rssi],
            ['Local status page', st && st.ip ? `http://${escape(st.ip)}/` : '—'],
            ['Uptime', st ? fmtDur(st.uptimeMs) : '—'],
            ['Last update', st ? `<span data-ago="${st.updatedAt}">${ago(st.updatedAt)}</span>` : '—']
        ].map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('');
        const day = sec.now() - 864e5, recent = s.events.filter(e => e.startedAt >= day);
        const count = t => recent.filter(e => e.type === t).length;
        const open = sec.openAlarms();
        $('sec-summary').innerHTML = [
            ['Theft attempts', count('tamper'), count('tamper') ? 'red' : 'green'],
            ['Motion events', count('motion'), count('motion') ? 'amber' : 'green'],
            ['Offline periods', count('device_offline'), count('device_offline') ? 'amber' : 'green'],
            ['Device restarts', count('device_restart'), undefined],
            ['Open alarms', open.length, open.length ? 'red' : 'green']
        ].map(([k, v, c]) => `<div><span>${k}</span>${badge(v, c)}</div>`).join('');
        $('sec-rows').innerHTML = securityRows(s);
        $('ack-all').disabled = !open.length;
        $('sec-note').textContent = s.storage === 'ephemeral' ? 'Logs are temporary: DATABASE_URL is not set, so events reset when the server restarts.' : `The ESP32 reports every few seconds; the unit is marked offline after ${Math.round(s.offlineAfterMs / 1000)} seconds without an update.`;
        if (window.lucide) window.lucide.createIcons();
    }
    async function acknowledge(ids) {
        try { await sec.ack(ids); toast(ids === 'all' ? 'All alarms acknowledged.' : 'Alarm acknowledged.'); }
        catch { toast('Could not reach the server. Try again.'); }
    }
    $('admin-content').addEventListener('click', e => { const b = e.target.closest('[data-sec-ack]'); if (b) { b.disabled = true; acknowledge(Number(b.dataset.secAck)); } });
    function exportSecurity() {
        const csv = [['Event ID', 'Started', 'Ended', 'Event', 'Severity', 'Duration (s)', 'Acknowledged'], ...sec.get().events.map(e => [e.id, new Date(e.startedAt).toISOString(), e.endedAt ? new Date(e.endedAt).toISOString() : '', sec.describe(e.type)[0], e.level, e.endedAt ? Math.round((e.endedAt - e.startedAt) / 1000) : '', e.level === 'info' ? '' : e.acked ? 'Yes' : 'No'])].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })), a = document.createElement('a'); a.href = url; a.download = 'bottlenet-security-log.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Security log export downloaded.');
    }
    $('export-button').onclick = () => { if (tab === 'security') { exportSecurity(); return; } const d = store.get(), csv = [['Transaction', 'Timestamp', 'Session', 'Bottle', 'Weight (g)', 'Result', 'Minutes'], ...d.transactions.map(t => [t.id, new Date(t.time).toISOString(), t.session, t.size && d.sizes[t.size] ? d.sizes[t.size].label : '', t.weight, t.accepted ? 'Accepted' : 'Rejected', t.minutes])].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })), a = document.createElement('a'); a.href = url; a.download = 'bottlenet-transactions.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Transaction export downloaded.'); };
    window.addEventListener('storage', () => { if (tab !== 'settings')
        render(); });
    window.addEventListener('bottlenet-change', () => { if (unlocked && tab !== 'settings' && tab !== 'security')
        render(); });
    window.addEventListener('bottlenet-mode', () => { if (unlocked)
        render(); });
    setInterval(() => { if (!unlocked || tab !== 'sessions')
        return; let expired = false; document.querySelectorAll('[data-expiry]').forEach(el => { el.textContent = store.time(Number(el.dataset.expiry) - Date.now()); if (Number(el.dataset.expiry) <= Date.now())
        expired = true; }); if (expired)
        render(); }, 1000);
    window.addEventListener('bottlenet-security', () => { if (!unlocked) return; renderAlarmChrome(); renderSecurityLive(); if (tab === 'security') renderHeaderStatus(); });
    setInterval(() => { if (!unlocked || tab !== 'security') return; document.querySelectorAll('[data-ago]').forEach(el => { el.textContent = ago(Number(el.dataset.ago)); }); document.querySelectorAll('[data-since]').forEach(el => { el.textContent = fmtDur(sec.now() - Number(el.dataset.since)); }); }, 1000);
    $('alarm-review').onclick = () => navigate('security');
    $('alarm-ack-all').onclick = () => acknowledge('all');
    show();
})();
