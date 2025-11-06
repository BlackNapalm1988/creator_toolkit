// Creator Toolkit front-end shell
(function () {
  const ROOT = document.getElementById('app');
  if (!ROOT) return;

  const state = {
    user: null,
    nav: [
      { id: 'nav-dashboard', label: 'Dashboard', view: 'dashboard-view', roles: ['admin','owner','editor','viewer'] },
      { id: 'nav-imagine', label: 'Imagine', view: 'imagine-view', roles: ['admin','owner','editor'] },
      { id: 'nav-create', label: 'Create', view: 'create-view', roles: ['admin','owner','editor'] },
      { id: 'nav-publish', label: 'Publish', view: 'publish-view', roles: ['admin','owner'] },
      { id: 'nav-system', label: 'System', view: 'system-view', roles: ['admin'] },
    ],
    activeView: ROOT.getAttribute('data-active-view') || 'dashboard-view',
  };

  function el(tag, attrs = {}, html = '') {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'dataset') {
        for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
      } else if (k.startsWith('on') && typeof v === 'function') {
        e.addEventListener(k.slice(2), v);
      } else {
        e.setAttribute(k, v);
      }
    }
    if (html) e.innerHTML = html;
    return e;
  }

  function renderNavItems() {
    const role = (state.user?.role || 'viewer').toLowerCase();
    return state.nav
      .filter(item => item.roles.includes(role))
      .map(item => (
        `<button type="button" class="ct-nav-item ${state.activeView===item.view?'active':''}" data-view="${item.view}" id="${item.id}">${item.label}</button>`
      )).join('');
  }

  function renderInspector() {
    return `
      <div class="ct-inspector-header">
        <div class="title">Inspector</div>
        <button id="toggleInspector" class="ghost-btn" type="button">Close</button>
      </div>
      <div class="ct-inspector-body" id="ct-inspector-content">
        <div class="placeholder">Details and actions will appear here.</div>
      </div>
    `;
  }

  function renderMain() {
    const viewName = state.nav.find(n => n.view === state.activeView)?.label || 'Dashboard';
    return `
      <div class="ct-main-header">
        <button id="toggleSidebar" class="ghost-btn" type="button">Toggle Sidebar</button>
        <div class="spacer"></div>
        <button id="openInspector" class="ghost-btn" type="button">Inspector</button>
      </div>
      <section class="ct-view" id="ct-view">
        <h2>${viewName}</h2>
        <p>Active view: <code>${state.activeView}</code></p>
      </section>
    `;
  }

  function renderShell() {
    const shell = `
      <div class="ct-shell" id="ct-shell-root">
        <aside id="ct-sidebar" class="ct-sidebar">
          <div class="ct-sidebar-header">
            <div class="title">Navigation</div>
            <button id="collapseSidebar" class="ghost-btn" type="button">Collapse</button>
          </div>
          <nav id="ct-nav" class="ct-nav">${renderNavItems()}</nav>
        </aside>
        <main id="ct-main" class="ct-main">${renderMain()}</main>
        <aside id="ct-inspector" class="ct-inspector">${renderInspector()}</aside>
      </div>
      <div id="ct-login-modal" class="ct-modal hidden" role="dialog" aria-modal="true">
        <div class="ct-modal-content">
          <div class="ct-modal-header">
            <div class="title">Log In</div>
            <button id="closeLoginModal" class="ghost-btn" type="button">×</button>
          </div>
          <div class="ct-modal-body">
            <div class="form-row">
              <label for="loginEmail">Email</label>
              <input id="loginEmail" type="email" placeholder="you@example.com" />
            </div>
            <div class="form-row">
              <label for="loginPassword">Password</label>
              <input id="loginPassword" type="password" placeholder="••••••••" />
            </div>
            <div id="loginError" class="error-text" style="display:none"></div>
            <div class="form-actions">
              <button id="loginSubmit" class="ghost-btn filled" type="button">Log In</button>
            </div>
          </div>
        </div>
      </div>
    `;
    ROOT.innerHTML = shell;
    ROOT.setAttribute('data-active-view', state.activeView);
  }

  function attachHandlers() {
    const rootEl = ROOT; // toggle classes on #app
    // Side nav buttons
    ROOT.querySelectorAll('#ct-nav .ct-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        state.activeView = view;
        rootEl.setAttribute('data-active-view', view);
        // re-render main, update active styles
        ROOT.querySelector('#ct-main').innerHTML = renderMain();
        ROOT.querySelectorAll('#ct-nav .ct-nav-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === view));
        // rewire buttons in main
        bindMainButtons();
      });
    });

    // Sidebar collapse
    ROOT.querySelector('#collapseSidebar')?.addEventListener('click', () => {
      rootEl.classList.toggle('ct-shell--sidebar-collapsed');
    });
    ROOT.querySelector('#toggleSidebar')?.addEventListener('click', () => {
      rootEl.classList.toggle('ct-shell--sidebar-collapsed');
    });

    // Inspector toggle
    ROOT.querySelector('#openInspector')?.addEventListener('click', () => {
      rootEl.classList.remove('ct-inspector--closed');
    });
    ROOT.querySelector('#toggleInspector')?.addEventListener('click', () => {
      rootEl.classList.toggle('ct-inspector--closed');
    });

    // Login modal handlers (use topbar button if present)
    const openBtn = document.getElementById('openLoginButton');
    const modal = document.getElementById('ct-login-modal');
    const closeBtn = document.getElementById('closeLoginModal');
    const submitBtn = document.getElementById('loginSubmit');
    const emailEl = document.getElementById('loginEmail');
    const passEl = document.getElementById('loginPassword');
    const errEl = document.getElementById('loginError');
    openBtn?.addEventListener('click', () => modal?.classList.remove('hidden'));
    closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
    submitBtn?.addEventListener('click', async () => {
      errEl.style.display = 'none';
      const email = (emailEl.value || '').trim();
      const password = passEl.value || '';
      if (!email || !password) {
        errEl.textContent = 'Email and password are required';
        errEl.style.display = 'block';
        return;
      }
      try {
        const resp = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(txt || 'Login failed');
        }
        modal?.classList.add('hidden');
        emailEl.value = '';
        passEl.value = '';
        await fetchMeAndUpdateUI();
      } catch (e) {
        errEl.textContent = e.message || 'Login failed';
        errEl.style.display = 'block';
      }
    });

    // Logout
    document.getElementById('logoutButton')?.addEventListener('click', async () => {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
      // Best-effort clear non-HttpOnly token cookie
      document.cookie = 'token=; Max-Age=0; path=/';
      state.user = null;
      renderShell();
      attachHandlers();
    });
  }

  function bindMainButtons() {
    ROOT.querySelector('#toggleSidebar')?.addEventListener('click', () => {
      ROOT.classList.toggle('ct-shell--sidebar-collapsed');
    });
    ROOT.querySelector('#openInspector')?.addEventListener('click', () => {
      ROOT.classList.remove('ct-inspector--closed');
    });
  }

  async function fetchMeAndUpdateUI() {
    let me = null;
    try {
      const resp = await fetch('/api/me', { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        me = data.user || null;
      }
    } catch (e) {
      // ignore
    }

    state.user = me;
    // Update header auth area
    const auth = document.getElementById('authActions');
    const userActions = document.getElementById('userActions');
    const greet = document.getElementById('userGreeting');
    const docsLink = document.getElementById('docsLink');
    if (me) {
      auth?.classList.add('hidden');
      userActions?.classList.remove('hidden');
      if (greet) greet.textContent = `Hi, ${me.full_name || me.email || 'creator'}`;
      if (docsLink) {
        const isAdmin = (me.role || '').toLowerCase() === 'admin';
        if (isAdmin) docsLink.classList.remove('hidden');
        else docsLink.classList.add('hidden');
      }
    } else {
      userActions?.classList.add('hidden');
      auth?.classList.remove('hidden');
      docsLink?.classList.add('hidden');
    }

    // Re-render shell to apply role filters on nav
    renderShell();
    attachHandlers();
  }

  // Initial boot
  renderShell();
  attachHandlers();
  fetchMeAndUpdateUI();
})();
