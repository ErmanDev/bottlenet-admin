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
    $('sign-out').onclick = () => { unlocked = false; try {
        sessionStorage.removeItem('bottlenet-admin');
    }
    catch { } inputs.forEach(i => i.value = ''); location.href = '../index.html'; };
    const descriptions = { overview: ['Station overview', 'A live look at your station and its impact.'], transactions: ['Transactions', 'Every bottle and every connection, accounted for.'], sessions: ['Active sessions', 'Manage the connections your station makes possible.'], machine: ['Machine status', 'Station health, collection capacity, and maintenance.'], security: ['Security and alarms', 'Bin tampering, unauthorised access, and alarm history.'], settings: ['Station settings', 'Manage bottle acceptance and connection rewards.'] };
    const badge = (text, color = 'green') => `<span class="badge ${color}">${text}</span>`;
    const alarmTypes = { bin_opened: ['Collection bin opened', 'Lid switch triggered outside a scheduled collection.'], bottle_removed: ['Bottles removed from bin', 'Bin weight dropped without a collection being recorded.'], tamper: ['Tamper detected', 'Enclosure movement or shock sensed by the tamper sensor.'], door_open: ['Service door left open', 'Service door has stayed open longer than two minutes.'], power: ['Power interruption', 'Station lost mains power and ran on backup.'] };
    const openAlarms = d => (d.alarms || []).filter(a => !a.ack);
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
        const modeBadge = $('mode-badge');
        if (modeBadge) {
            modeBadge.textContent = on ? 'Live' : 'Waiting';
            modeBadge.className = `mode-badge ${on ? 'live' : 'demo'}`;
            modeBadge.title = on ? 'Receiving ESP8266 status' : 'Waiting for ESP8266 ingest';
        }
        const ws = $('workspace-badge');
        if (ws) { ws.textContent = on ? 'Live ESP8266' : 'Waiting for ESP8266'; ws.className = on ? 'badge green' : 'badge'; }
        const foot = $('updated-label');
        if (foot) foot.textContent = on ? 'Live from ESP8266' : 'Waiting for device ingest';
        const sideName = $('sidebar-station-name');
        if (sideName) sideName.textContent = stationLabel(d);
        $('breadcrumb').textContent = tab[0].toUpperCase() + tab.slice(1);
        $('page-title').textContent = descriptions[tab][0];
        $('page-description').textContent = descriptions[tab][1];
        const eyebrow = document.querySelector('.page-heading .eyebrow');
        if (eyebrow) eyebrow.textContent = stationLabel(d).toUpperCase();
        document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        $('sidebar-status').textContent = d.station === 'ready' ? 'Station online' : d.station[0].toUpperCase() + d.station.slice(1);
        const unread = openAlarms(d);
        const worst = unread.some(a => a.level === 'critical');
        $('alarm-banner').hidden = !unread.length;
        const latest = unread[0];
        $('alarm-banner').dataset.level = worst ? 'critical' : 'warning';
        if (latest) {
            $('alarm-banner-level').textContent = worst ? 'CRITICAL' : 'WARNING';
            $('alarm-banner-title').textContent = alarmTypes[latest.type][0];
            $('alarm-banner-text').textContent = `${alarmTypes[latest.type][1]} · ${stationLabel(d)} · ${new Date(latest.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${unread.length > 1 ? ` · +${unread.length - 1} more open alarm${unread.length > 2 ? 's' : ''}` : ''}`;
        }
        const navCount = document.querySelector('[data-tab="security"] .nav-count');
        if (navCount) { navCount.textContent = unread.length; navCount.hidden = !unread.length; }
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
            $('admin-content').innerHTML = `<div class="machine-details"><section class="section-surface"><div class="section-title"><h2>Station diagnostics</h2>${badge(on ? 'Live device' : 'Simulated', on ? 'green' : undefined)}</div><div class="detail-list"><div><span>Controller</span><strong>ESP8266 / ${stationCode(d)}</strong></div><div><span>Station</span><strong>${stationLabel(d)}</strong></div><div><span>Status</span>${badge(d.station, d.station === 'ready' ? 'green' : 'amber')}</div><div><span>Bin fill level</span><strong>${d.bin}%${d.trashLevel ? ` · ${d.trashLevel}` : ''}${d.trashDistanceCm != null ? ` · ${d.trashDistanceCm} cm` : ''}</strong></div><div><span>Last bottle</span><strong>${on ? `${d.lastBottle || 'None'} · ${d.lastResult || 'Waiting'}` : (d.transactions[0] ? d.transactions[0].id : '—')}</strong></div><div><span>Last bottle weight</span><strong>${on ? `${d.lastWeightG || 0} g` : `${d.transactions[0] ? d.transactions[0].weight : 0} g`}</strong></div><div><span>Wi-Fi remaining</span><strong>${store.time(Math.max(0, d.expiresAt - Date.now()))}</strong></div><div><span>Last reward</span><strong>+${d.lastReward || 0} min</strong></div><div><span>Load cell</span>${badge(on ? 'Device' : 'Operational', on ? 'green' : undefined)}</div><div><span>Internet gateway</span>${badge(on ? 'SoftAP live' : 'Mock connection', 'blue')}</div></div></section><section class="section-surface"><div class="section-title"><h2>Station controls</h2></div><div class="machine-summary"><div class="form-row"><div><label for="maintenance">Maintenance mode</label><p>Temporarily suspend new deposits.</p></div><input id="maintenance" type="checkbox" class="toggle" ${d.station === 'maintenance' ? 'checked' : ''}></div><div class="form-row"><div><h3>Collection complete</h3><p>Record an emptied collection bin.</p></div><button class="button secondary" id="empty-bin">Empty bin</button></div></div></section></div>`;
            $('maintenance').onchange = e => { store.update(s => { s.station = e.target.checked ? 'maintenance' : s.bin >= 100 ? 'full' : 'ready'; s.depositUntil = 0; }); render(); toast('Station availability updated.'); };
            $('empty-bin').onclick = () => { if (!confirm('Record that the bin has been emptied?'))
                return; store.update(s => { s.bin = 0; if (s.station === 'full')
                s.station = 'ready'; }); render(); toast('Bin collection recorded.'); };
        }
        if (tab === 'security') {
            const alarms = d.alarms || [];
            $('admin-content').innerHTML = `<section class="section-surface"><div class="section-title"><div><h2>Alarm history</h2><p>Bin, enclosure, and power events at this station.</p></div><button class="text-button" id="ack-all" ${openAlarms(d).length ? '' : 'disabled'}>Acknowledge all</button></div><div class="table-wrap"><table><thead><tr><th>ALARM</th><th>TIME</th><th>EVENT</th><th>SEVERITY</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${alarms.length ? alarms.map(a => `<tr class="alarm-row ${a.level}"><td>${a.id}</td><td>${new Date(a.time).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td><strong>${alarmTypes[a.type][0]}</strong><br><span class="muted">${alarmTypes[a.type][1]}</span></td><td>${badge(a.level === 'critical' ? 'Critical' : 'Warning', a.level === 'critical' ? 'red' : 'amber')}</td><td>${a.ack ? badge('Acknowledged', 'green') : badge('Open', 'red')}</td><td>${a.ack ? '—' : `<button class="text-button" data-ack="${a.id}">Acknowledge</button>`}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No alarms recorded.</td></tr>'}</tbody></table></div><p class="muted">Demo only: alarms are simulated in the browser. Production needs hardware sensors and server-side alerting.</p></section>`;
            document.querySelectorAll('[data-ack]').forEach(b => b.onclick = () => { store.update(s => { const alarm = s.alarms.find(a => a.id === b.dataset.ack); if (alarm) alarm.ack = true; }); render(); toast('Alarm acknowledged.'); });
            $('ack-all').onclick = () => { store.update(s => s.alarms.forEach(a => a.ack = true)); render(); toast('All alarms acknowledged.'); };
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
    $('export-button').onclick = () => { const d = store.get(), csv = [['Transaction', 'Timestamp', 'Session', 'Bottle', 'Weight (g)', 'Result', 'Minutes'], ...d.transactions.map(t => [t.id, new Date(t.time).toISOString(), t.session, t.size && d.sizes[t.size] ? d.sizes[t.size].label : '', t.weight, t.accepted ? 'Accepted' : 'Rejected', t.minutes])].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })), a = document.createElement('a'); a.href = url; a.download = 'bottlenet-transactions.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Transaction export downloaded.'); };
    window.addEventListener('storage', () => { if (tab !== 'settings')
        render(); });
    window.addEventListener('bottlenet-change', () => { if (unlocked && tab !== 'settings')
        render(); });
    window.addEventListener('bottlenet-mode', () => { if (unlocked)
        render(); });
    setInterval(() => { if (!unlocked || tab !== 'sessions')
        return; let expired = false; document.querySelectorAll('[data-expiry]').forEach(el => { el.textContent = store.time(Number(el.dataset.expiry) - Date.now()); if (Number(el.dataset.expiry) <= Date.now())
        expired = true; }); if (expired)
        render(); }, 1000);
    $('alarm-review').onclick = () => navigate('security');
    $('alarm-ack-all').onclick = () => { store.update(s => s.alarms.forEach(a => a.ack = true)); render(); toast('All alarms acknowledged.'); };
    show();
})();
