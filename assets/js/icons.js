/* Use the same icon vocabulary across both entry points. */
(() => {
    const logoUrl = new URL('../images/bottlenet-mark.svg', document.currentScript.src).href;
    document.querySelectorAll('.brand-mark').forEach(el => {
        const logo = document.createElement('img');
        logo.src = logoUrl;
        logo.alt = '';
        logo.width = 29;
        logo.height = 29;
        el.replaceChildren(logo);
        el.setAttribute('aria-hidden', 'true');
    });
    const apply = () => {
        if (!window.lucide)
            return;
        document.querySelectorAll('.impact-icon,.wifi-symbol,.login-icon').forEach(el => {
            if (el.querySelector('svg'))
                return;
            const name = el.classList.contains('wifi-symbol') ? 'wifi' : el.classList.contains('login-icon') ? 'lock-keyhole' : 'recycle';
            el.innerHTML = `<i data-lucide="${name}"></i>`;
        });
        const names = { overview: 'layout-dashboard', transactions: 'arrow-left-right', sessions: 'wifi', machine: 'cpu', security: 'shield-alert', settings: 'settings' };
        document.querySelectorAll('[data-tab] > span:first-child').forEach(el => { if (!el.querySelector('svg'))
            el.innerHTML = `<i data-lucide="${names[el.parentElement.dataset.tab]}"></i>`; });
        window.lucide.createIcons();
    };
    window.addEventListener('icons-ready', apply);
    apply();
})();
