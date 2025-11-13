// Creator Toolkit front-end shell
(function () {
  const ROOT = document.getElementById("app");
  if (!ROOT) return;

  const path = window.location?.pathname || "";
  const routeMap = {
    "/": "dashboard-view",
    "/dashboard": "dashboard-view",
    "/imagine": "imagine-view",
    "/create": "create-hub-view",
    "/create/": "create-hub-view",
    "/publish": "publish-view",
    "/system": "system-view",
  };
  let routeActive = routeMap[path];
  // Hash-based deep links (e.g., #/create-video-view)
  if (!routeActive && window.location.hash) {
    const h = window.location.hash.replace(/^#\/?/, "");
    if (h && document.getElementById(h)) routeActive = h;
  }
  const initialActive = routeActive || ROOT.getAttribute("data-active-view") || "dashboard-view";

  const state = {
    user: null,
    ls: { collapsed: "sidebarCollapsed", workspace: "activeWorkspace", pending: "pendingWorkspace" },
    get collapsed() { return localStorage.getItem(this.ls.collapsed) === "true"; },
    set collapsed(v) { localStorage.setItem(this.ls.collapsed, v ? "true" : "false"); },
    get workspace() { return localStorage.getItem(this.ls.workspace) || "Default"; },
    set workspace(n) { localStorage.setItem(this.ls.workspace, n); },
    set pending(n) { localStorage.setItem(this.ls.pending, n); },
    get pending() { return localStorage.getItem(this.ls.pending) || null; },
    // Navigation model: label + view id + role gating + endpoint path
    nav: [
      {
        id: "nav-dashboard",
        label: "Dashboard",
        icon: "🏠",
        view: "dashboard-view",
        roles: ["admin", "owner", "editor", "viewer"],
        path: "/dashboard",
      },
      {
        id: "nav-imagine",
        label: "Imagine",
        icon: "✨",
        view: "imagine-view",
        roles: ["admin", "owner", "editor"],
        path: "/imagine",
      },
      {
        id: "nav-create",
        label: "Create",
        icon: "🎬",
        view: "create-hub-view",
        roles: ["admin", "owner", "editor"],
        path: "/create",
      },
      {
        id: "nav-publish",
        label: "Publish",
        icon: "📣",
        view: "publish-view",
        roles: ["admin", "owner"],
        path: "/publish",
      },
      {
        id: "nav-system",
        label: "System",
        icon: "🛠️",
        view: "system-view",
        roles: ["admin"],
        path: "/system",
      },
    ],
    activeView: initialActive,
  };
  // Workspace meta (last opened etc.) stored locally
  const WS_META_KEY = 'workspaceMeta';
  function getWorkspaceMeta() {
    try {
      const raw = localStorage.getItem(WS_META_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function setWorkspaceMeta(name, patch) {
    const meta = getWorkspaceMeta();
    meta[name] = { ...(meta[name] || {}), ...(patch || {}) };
    try { localStorage.setItem(WS_META_KEY, JSON.stringify(meta)); } catch {}
  }
  function formatRelativeTime(isoOrMs) {
    if (!isoOrMs) return '';
    const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 30000) return 'just now';
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return `${s}s ago`;
  }

  function renderNavItems() {
    const role = (state.user?.role || "viewer").toLowerCase();
    return state.nav
      .filter((item) => item.roles.includes(role))
      .map(
        (item) =>
          `<button type=\"button\" class=\"ct-nav-link ${state.activeView === item.view ? "active" : ""}\" data-view=\"${item.view}\" data-path=\"${item.path}\" id=\"${item.id}\">\n           <span class=\"ct-nav-link__icon\" aria-hidden=\"true\">${item.icon || ""}</span>\n           <span class=\"ct-nav-link__label label\">${item.label}</span>\n         </button>`,
      )
      .join("");
  }

  function renderShell() {
    // Preserve legacy content (views) while rebuilding the shell
    const prevViews = document.getElementById("legacyContent");
    const viewsNode = prevViews ? prevViews : null;

    const shell = `
      <div class="ct-shell" id="ct-shell-root">
        <aside id="ct-sidebar" class="ct-sidebar" data-expanded="true">
          <div class="ct-sidebar__inner">
            <div class="ct-sidebar__header">
              <button id="workspaceDropdownBtn" class="ct-workspace__title ghost-btn" aria-expanded="false" aria-haspopup="menu">&#x1F5C2;&#xFE0F; <span id="workspaceTitleLabel" class="label"></span></button>
              <div id="workspaceMenu" class="menu hidden" role="menu"></div>
              <button id="collapseSidebar" class="ct-sidebar__toggle" type="button" title="Toggle sidebar" aria-label="Toggle sidebar">↔</button>
            </div>
            <nav id="ct-nav" class="ct-sidebar__nav">${renderNavItems()}</nav>
            <div class="ct-sidebar-bottom" style="padding: 0.75rem 0.85rem 1rem;">
              <a href="/settings/project" class="ct-nav-link" aria-label="Project Settings">&#x2699;&#xFE0F; <span class="ct-nav-link__label label">Project Settings</span></a>
            </div>
          </div>
        </aside>
        <main id="ct-main" class="ct-main">
          <div class="ct-main-workspace" id="ct-workspace"></div>
        </main>
        <aside id="ct-inspector" class="ct-inspector">
          <div class="ct-workspace-section" style="width:100%">
            <div class="ct-workspace-header">
              <h2>Inspector</h2>
              <p class="help-text">Details and actions appear here.</p>
            </div>
            <div class="ct-workspace-body">
              <p class="ct-empty">Select an item to inspect.</p>
            </div>
            <div style="padding-top:0.5rem">
              <button id="toggleInspector" class="ghost-btn" type="button">Close</button>
            </div>
          </div>
        </aside>
      </div>
    `;

    ROOT.innerHTML = shell;

    // Re-attach the legacy view containers into the workspace
    const target = ROOT.querySelector("#ct-workspace");
    if (target && viewsNode) {
      target.appendChild(viewsNode);
    }

    ROOT.setAttribute("data-active-view", state.activeView);
    applyActiveView(state.activeView, { updateHistory: false });
    // Ensure nav buttons have accessible titles for tooltip on collapse
    ROOT.querySelectorAll('#ct-nav .ct-nav-link').forEach((btn) => {
      const label = btn.querySelector('.ct-nav-link__label')?.textContent || '';
      if (label) {
        btn.setAttribute('title', label);
        btn.setAttribute('aria-label', label);
      }
    });
    // Sync create tabs active state if present
    ROOT.querySelectorAll('.ct-tab').forEach((t) => {
      const v = t.getAttribute('data-view');
      t.classList.toggle('active', v === state.activeView);
    });
    const shellRoot = ROOT.querySelector("#ct-shell-root");
    if (state.collapsed) shellRoot?.classList.add("ct-shell--sidebar-collapsed");
    setWorkspaceTitle(state.workspace);
    // Ensure current workspace has a lastOpened stamp if missing
    const meta = getWorkspaceMeta();
    if (!meta[state.workspace] || !meta[state.workspace].lastOpened) {
      setWorkspaceMeta(state.workspace, { lastOpened: Date.now() });
    }
  }

  function applyActiveView(viewId, opts = {}) {
    // Alias legacy create-view to new hub
    if (viewId === "create-view") viewId = "create-hub-view";
    state.activeView = viewId;
    // Update nav active state
    const createViews = new Set([
      "create-hub-view",
      "create-video-view",
      "create-music-view",
      "create-mastering-view",
    ]);
    ROOT.querySelectorAll("#ct-nav .ct-nav-link").forEach((btn) => {
      const btnView = btn.getAttribute("data-view");
      const isCreateBtn = btnView === "create-hub-view" || btnView === "create-view";
      const active = isCreateBtn ? createViews.has(viewId) : btnView === viewId;
      btn.classList.toggle("active", active);
    });
    // Update topbar active state if present
    document.querySelectorAll(".ct-topbar-nav.ct-nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewId);
    });
    // Toggle view sections (those provided by the server templates)
    document.querySelectorAll(".app-view").forEach((sec) => {
      sec.classList.toggle("active", sec.id === viewId);
    });
    // Update data attribute and optionally history
    ROOT.setAttribute("data-active-view", viewId);
    if (opts.updateHistory) {
      const navItem = state.nav.find((n) => n.view === viewId || (n.view === "create-hub-view" && createViews.has(viewId)));
      if (navItem && navItem.path) {
        try {
          window.history.pushState({ view: viewId }, "", navItem.path);
        } catch {}
      }
    }
    // Ensure workspace scroll position is reset
    ROOT.querySelector(".ct-main-workspace")?.scrollTo({
      top: 0,
      behavior: "instant",
    });
    // Populate lists if switching into Create modules
    try { hydrateCreateModuleLists(); } catch {}
  }

  function attachHandlers() {
    const shellEl = ROOT.querySelector("#ct-shell-root");
    const inspectorEl = ROOT.querySelector("#ct-inspector");

    // Side nav buttons
    ROOT.querySelectorAll("#ct-nav .ct-nav-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        applyActiveView(view, { updateHistory: true });
      });
    });

    // Also wire any topbar nav items declared in HTML
    document.querySelectorAll(".ct-topbar-nav.ct-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        applyActiveView(view, { updateHistory: true });
      });
    });

    // Sidebar collapse/expand with persistence
    ROOT.querySelector("#collapseSidebar")?.addEventListener("click", () => {
      shellEl.classList.toggle("ct-shell--sidebar-collapsed");
      const collapsed = shellEl.classList.contains("ct-shell--sidebar-collapsed");
      state.collapsed = collapsed;
      ROOT.querySelector("#ct-sidebar")?.setAttribute("data-expanded", String(!collapsed));
    });

    // Inspector toggle
    ROOT.querySelector("#toggleInspector")?.addEventListener("click", () => {
      shellEl.classList.toggle("ct-shell--inspector-closed");
      inspectorEl.classList.toggle("ct-inspector--closed");
    });

    // Login modal using the existing overlay in templates/dashboard.html
    const openBtn = document.getElementById("openLoginButton");
    const overlay = document.getElementById("authOverlay");
    const loginForm = document.getElementById("overlayLoginForm");
    const loginEmail = document.getElementById("overlayLoginEmail");
    const loginPassword = document.getElementById("overlayLoginPassword");
    const authFeedback = document.getElementById("authFeedback");

    openBtn?.addEventListener("click", () =>
      overlay?.classList.remove("hidden"),
    );

    // Profile modal open/close
    const profileBtn = document.getElementById("profileButton");
    const profileModal = document.getElementById("profileModal");
    const closeProfileBtn = document.getElementById("closeProfileModal");
    profileBtn?.addEventListener("click", () => profileModal?.classList.remove("hidden"));
    closeProfileBtn?.addEventListener("click", () => profileModal?.classList.add("hidden"));
    // Allow opening profile from verification overlay shortcut
    const verifyOpenProfile = document.getElementById("verifyOpenProfile");
    const verificationOverlay = document.getElementById("verificationOverlay");
    verifyOpenProfile?.addEventListener("click", () => {
      verificationOverlay?.classList.add("hidden");
      profileModal?.classList.remove("hidden");
    });

    // Create sub-module tabs
    document.querySelectorAll('.ct-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        if (!view) return;
        applyActiveView(view, { updateHistory: false });
        document.querySelectorAll('.ct-tab').forEach((t) => {
          t.classList.toggle('active', t.getAttribute('data-view') === view);
        });
      });
    });

    // Create hub cards (clickable entire card)
    document.querySelectorAll('.create-card[data-view]').forEach((card) => {
      const activate = () => {
        const view = card.getAttribute('data-view');
        if (!view) return;
        applyActiveView(view, { updateHistory: false });
        document.querySelectorAll('.ct-tab').forEach((t) => {
          t.classList.toggle('active', t.getAttribute('data-view') === view);
        });
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });

    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (authFeedback) authFeedback.textContent = "";
      const email = (loginEmail?.value || "").trim();
      const password = loginPassword?.value || "";
      if (!email || !password) {
        if (authFeedback)
          authFeedback.textContent = "Email and password are required";
        return;
      }
      try {
        const resp = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(txt || "Login failed");
        }
        overlay?.classList.add("hidden");
        if (loginEmail) loginEmail.value = "";
        if (loginPassword) loginPassword.value = "";
        await fetchMeAndUpdateUI();
      } catch (err) {
        if (authFeedback)
          authFeedback.textContent = err.message || "Login failed";
      }
    });

    // Logout
    document
      .getElementById("logoutButton")
      ?.addEventListener("click", async () => {
        try {
          await fetch("/auth/logout", {
            method: "POST",
            credentials: "include",
          });
        } catch {}
        document.cookie = "token=; Max-Age=0; path=/";
        state.user = null;
        renderShell();
        attachHandlers();
      });

    // Workspace dropdown behaviors
    const ddBtn = document.getElementById("workspaceDropdownBtn");
    const menu = document.getElementById("workspaceMenu");
    ddBtn?.addEventListener("click", () => {
      const open = ddBtn.getAttribute("aria-expanded") === "true";
      ddBtn.setAttribute("aria-expanded", String(!open));
      if (menu) menu.classList.toggle("hidden", open);
    });
    document.addEventListener("click", (e) => {
      if (!ddBtn || !menu) return;
      const t = e.target;
      const clickedInside = ddBtn.contains(t) || menu.contains(t);
      if (!clickedInside) {
        ddBtn.setAttribute("aria-expanded", "false");
        menu.classList.add("hidden");
      }
    });

    // Global click handler for workspace actions
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-action]");
      if (!t) return;
      const action = t.getAttribute("data-action");
      if (action === "open-workspace-create") {
        document.getElementById("createWorkspaceModal")?.classList.remove("hidden");
        // focus cancel to avoid accidental accepts
        setTimeout(() => document.querySelector('#createWorkspaceModal [data-action="create-workspace-cancel"]')?.focus(), 0);
      }
      if (action === "create-workspace-cancel") {
        document.getElementById("createWorkspaceModal")?.classList.add("hidden");
        const fb = document.getElementById("createWorkspaceFeedback");
        if (fb) fb.textContent = "";
      }
      if (action === "create-workspace-submit") {
        const input = document.getElementById("newWorkspaceName");
        const name = (input?.value || "").trim();
        const fb = document.getElementById("createWorkspaceFeedback");
        if (!name) {
          if (fb) fb.textContent = 'Name is required';
          return;
        }
        if (!/^[A-Za-z0-9_\-\s]+$/.test(name) || name.toLowerCase() === 'con') {
          if (fb) fb.textContent = 'Use letters, numbers, dash, underscore, or space';
          return;
        }
        createWorkspace(name);
      }
      if (action === "select-workspace") {
        const name = t.getAttribute("data-name");
        if (name) openConfirmSwitch(name);
      }
      if (action === "confirm-switch-cancel") {
        document.getElementById("confirmSwitchModal")?.classList.add("hidden");
        state.pending = "";
      }
      if (action === "confirm-switch-continue") {
        const name = state.pending || "Default";
        // Persist the chosen workspace immediately
        try { localStorage.setItem('activeWorkspace', name); } catch {}
        state.workspace = name;
        state.pending = "";
        // Update title immediately before navigating
        setWorkspaceTitle(name);
        // stamp last opened meta
        try { setWorkspaceMeta(name, { lastOpened: Date.now() }); } catch {}
        document.getElementById("confirmSwitchModal")?.classList.add("hidden");
        const qs = `?ws=${encodeURIComponent(name)}`;
        window.location.href = "/settings/project" + qs;
      }
    });

    // Load workspaces
    loadWorkspaces();
  }

  async function fetchMeAndUpdateUI() {
    let me = null;
    try {
      const resp = await fetch("/api/me", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        me = data.user || null;
      }
    } catch (e) {
      // ignore
    }

    state.user = me;
    // Update header auth area
    const auth = document.getElementById("authActions");
    const userActions = document.getElementById("userActions");
    const greet = document.getElementById("userGreeting");
    const docsLink = document.getElementById("docsLink");
    if (me) {
      auth?.classList.add("hidden");
      userActions?.classList.remove("hidden");
      if (greet)
        greet.textContent = `Hi, ${me.full_name || me.email || "creator"}`;
      if (docsLink) {
        const isAdmin = (me.role || "").toLowerCase() === "admin";
        if (isAdmin) docsLink.classList.remove("hidden");
        else docsLink.classList.add("hidden");
      }
    } else {
      userActions?.classList.add("hidden");
      auth?.classList.remove("hidden");
      docsLink?.classList.add("hidden");
    }

    // Re-render shell to apply role filters on nav while preserving views
    renderShell();
    attachHandlers();
    // Populate recent lists if present
    try { await hydrateCreateModuleLists(); } catch {}
  }

  // Workspace helpers
  function renderWorkspaceMenu(items) {
    const menu = document.getElementById("workspaceMenu");
    if (!menu) return;
    menu.innerHTML = "";
    const addBtn = document.createElement("button");
    addBtn.className = "menu-item";
    addBtn.setAttribute("data-action", "open-workspace-create");
    addBtn.textContent = "Add New Workspace…";
    menu.appendChild(addBtn);
    const hr = document.createElement("div");
    hr.style.margin = "6px 0";
    hr.style.height = "1px";
    hr.style.background = "var(--border, #2a2a2a)";
    menu.appendChild(hr);
    (items || []).forEach((name) => {
      const btn = document.createElement("button");
      btn.className = "menu-item";
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute("data-action", "select-workspace");
      btn.setAttribute("data-name", name);
      btn.textContent = name;
      menu.appendChild(btn);
    });
    // Enhance labels with last opened and disable current workspace
    const meta = getWorkspaceMeta();
    menu.querySelectorAll('.menu-item[data-name]').forEach((btn) => {
      const name = btn.getAttribute('data-name');
      if (!name) return;
      const current = name === state.workspace;
      const last = meta[name]?.lastOpened;
      if (current) {
        btn.textContent = `${name} (current)`;
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.title = 'Current workspace';
      } else if (last) {
        const suffix = ` (${formatRelativeTime(last)})`;
        btn.textContent = `${name}${suffix}`;
        btn.title = `Last opened ${formatRelativeTime(last)}`;
      }
    });
  }

  async function loadWorkspaces() {
    try {
      const r = await fetch("/api/workspaces");
      if (!r.ok) throw new Error("Failed to load workspaces");
      const { items } = await r.json();
      renderWorkspaceMenu(items || ["Default"]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Failed to load workspaces", e);
      renderWorkspaceMenu(["Default"]);
    }
  }

  // Expose for template-level tab controls
  window.applyActiveView = applyActiveView;

  // --- Recent lists wiring for Create modules ---
  async function fetchRecentJobs() {
    try {
      const r = await fetch('/dashboard/data', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        return Array.isArray(j.recent_jobs) ? j.recent_jobs : [];
      }
    } catch {}
    try {
      const r2 = await fetch('/jobs', { credentials: 'include' });
      if (r2.ok) {
        const j2 = await r2.json();
        return Array.isArray(j2.jobs) ? j2.jobs : [];
      }
    } catch {}
    return [];
  }

  function renderList(container, items, { kind }) {
    if (!container) return;
    container.innerHTML = '';
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'dashboard-placeholder';
      p.textContent = 'No recent items.';
      container.appendChild(p);
      return;
    }
    items.forEach((job) => {
      const btn = document.createElement('button');
      btn.className = 'ct-nav-child__button';
      const label = job.out_path ? String(job.out_path).split('/').slice(-1)[0] : (job.id || 'job');
      btn.textContent = label;
      btn.setAttribute('data-path', job.out_path || '');
      btn.setAttribute('data-kind', kind);
      btn.title = `${job.type || 'job'} • ${job.status || ''}`.trim();
      container.appendChild(btn);
    });
  }

  async function hydrateCreateModuleLists() {
    const jobs = await fetchRecentJobs();
    // Buckets
    const mp4Jobs = jobs.filter((j) => (j.out_path || '').toLowerCase().endsWith('.mp4'));
    const mp3Jobs = jobs.filter((j) => (j.out_path || '').toLowerCase().endsWith('.mp3'));

    renderList(document.getElementById('videoScenesList'), mp4Jobs, { kind: 'video' });
    renderList(document.getElementById('musicTracksList'), mp3Jobs, { kind: 'audio' });
    renderList(document.getElementById('masterAssetsList'), mp4Jobs, { kind: 'master' });

    // Click to apply selection
    document.querySelectorAll('.ct-nav-child__button[data-path]').forEach((el) => {
      el.addEventListener('click', () => {
        const path = el.getAttribute('data-path') || '';
        const kind = el.getAttribute('data-kind') || '';
        if (!path) return;
        const resolved = path.startsWith('/') ? path : `/${path}`;
        if (kind === 'video') {
          const vid = document.getElementById('videoPreview');
          if (vid) vid.src = resolved;
        } else if (kind === 'audio') {
          const aud = document.getElementById('musicPreview');
          if (aud) aud.src = resolved;
        } else if (kind === 'master') {
          const inp = document.getElementById('masterLoopPath');
          if (inp) inp.value = path;
        }
      });
    });
  }

  function setWorkspaceTitle(name) {
    const el = document.getElementById("workspaceTitleLabel");
    if (el) el.textContent = name || (localStorage.getItem("activeWorkspace") || "Default");
  }

  function openConfirmSwitch(name) {
    state.pending = name;
    document.getElementById("confirmSwitchModal")?.classList.remove("hidden");
    // focus cancel by default to avoid accidental acceptance
    setTimeout(() => document.querySelector('#confirmSwitchModal [data-action="confirm-switch-cancel"]')?.focus(), 0);
  }

  async function createWorkspace(name) {
    const feedback = document.getElementById("createWorkspaceFeedback");
    if (feedback) feedback.textContent = "";
    try {
      const r = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({ detail: "Error" }));
        throw new Error(j.detail || "Failed to create workspace");
      }
      document.getElementById("createWorkspaceModal")?.classList.add("hidden");
      openConfirmSwitch(name);
      loadWorkspaces();
    } catch (err) {
      if (feedback) feedback.textContent = err.message;
    }
  }

  // Initial boot
  renderShell();
  attachHandlers();
  fetchMeAndUpdateUI();
})();
