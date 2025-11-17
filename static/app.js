// Creator Toolkit front-end shell
(function () {
  const ROOT = document.getElementById("app");
  if (!ROOT) return;

    // --- FIX: Apply workspace from ?ws BEFORE anything renders ---
  const params = new URLSearchParams(window.location.search);
  const wsParam = params.get("ws");
  const loginParam = params.get("login");

  if (wsParam && wsParam.trim()) {
    const normalized = wsParam.trim();
    localStorage.setItem("activeWorkspace", normalized);
  }
  if (loginParam === '1' || loginParam === 'true') {
    // Defer opening the auth overlay until DOM is ready
    window.addEventListener('DOMContentLoaded', () => {
      const ov = document.getElementById('authOverlay');
      if (ov) {
        ov.classList.remove('hidden');
        ov.style.display = 'flex';
      }
    });
  }
  // --------------------------------------------------------------

  const path = window.location?.pathname || "";
  function getDefaultFlag() {
    const attr = document.body?.getAttribute('data-dark-ui');
    return attr === '1';
  }
  function getFlag() {
    const ls = localStorage.getItem('useDarkStudio');
    if (ls === 'true') return true;
    if (ls === 'false') return false;
    return getDefaultFlag();
  }
  function applyThemeFlag(enabled) {
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;
    if (enabled) {
      html.classList.add('dark-studio');
      body.classList.add('dark-studio');
    } else {
      html.classList.remove('dark-studio');
      body.classList.remove('dark-studio');
    }
  }

  const useDarkStudio = getFlag();
  applyThemeFlag(useDarkStudio);
  const IMAGINE_THREAD_KEY = "ctActiveImagineThread";
  const ALLOWED_MODELS_KEY = "ctAllowedImagineModels";
  const DEFAULT_ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o", "o4-mini"];

  function sanitizeKeyPart(value, fallback = "default") {
    const safe = (value || "").toString().trim() || fallback;
    return safe.replace(/[^\w\-]/g, "_");
  }

  function getActiveWorkspaceName() {
    try {
      if (typeof state !== "undefined" && state?.workspace) {
        return sanitizeKeyPart(state.workspace, "Default");
      }
      const raw = localStorage.getItem("activeWorkspace");
      if (raw) return sanitizeKeyPart(raw, "Default");
    } catch {}
    return "Default";
  }

  function getCurrentUserKey() {
    try {
      if (typeof state !== "undefined" && state?.user) {
        const userId = state.user.id || state.user.email || state.user.username;
        if (userId) {
          const cleaned = sanitizeKeyPart(userId, "guest");
          localStorage.setItem("ctUserKey", cleaned);
          return cleaned;
        }
      }
      const cached = localStorage.getItem("ctUserKey");
      if (cached) return sanitizeKeyPart(cached, "guest");
    } catch {}
    return "guest";
  }

  function getWorkspaceScopedModelKey() {
    const ws = getActiveWorkspaceName();
    const user = getCurrentUserKey();
    return `${ALLOWED_MODELS_KEY}:${ws}:${user}`;
  }

  function getAllowedImagineModels() {
    const scopedKey = getWorkspaceScopedModelKey();
    const legacyKey = ALLOWED_MODELS_KEY;
    const readKey = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .filter((m) => typeof m === "string" && m.trim().length)
            .map((m) => m.trim());
          if (cleaned.length) return Array.from(new Set(cleaned));
        }
      } catch {}
      return null;
    };
    const scoped = readKey(scopedKey);
    if (scoped) return scoped;
    const legacy = readKey(legacyKey);
    if (legacy) {
      try { localStorage.setItem(scopedKey, JSON.stringify(legacy)); } catch {}
      return legacy;
    }
    try {
    } catch {}
    return DEFAULT_ALLOWED_MODELS.slice();
  }

  const routeMap = {
    "/": "dashboard-view",
    "/dashboard": "dashboard-view",
    "/imagine": "dashboard-view",
    "/settings": "settings-profile",
    "/create": useDarkStudio ? "create-hub-view" : "create-view",
    "/create/": useDarkStudio ? "create-hub-view" : "create-view",
    "/publish": "publish-view",
    "/library": "library-view",
    "/system": "system-view",
  };
  const CREATE_VIEW_IDS = new Set([
    "create-hub-view",
    "create-video-view",
    "create-music-view",
    "create-mastering-view",
  ]);
  let routeActive = routeMap[path];
  // Hash-based deep links (e.g., #/create-video-view)
  if (!routeActive && window.location.hash) {
    const h = window.location.hash.replace(/^#\/?/, "");
    if (h && document.getElementById(h)) routeActive = h;
  }
  const initialActive = routeActive || ROOT.getAttribute("data-active-view") || "dashboard-view";

  const initialAllowedModels = getAllowedImagineModels();
  const initialModelSelection = initialAllowedModels[0] || DEFAULT_ALLOWED_MODELS[0];

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
        id: "nav-imagine",
        label: "Imagine",
        icon: '<img src="/static/icons/imagine.svg" class="ct-nav-link__icon-img" alt="" />',
        view: null,
        roles: ["admin", "owner", "editor"],
        path: "/imagine",
      },
      {
        id: "nav-create",
        label: "Create",
        icon: '<img src="/static/icons/create.svg" class="ct-nav-link__icon-img" alt="" />',
        view: useDarkStudio ? "create-hub-view" : "create-view",
        roles: ["admin", "owner", "editor"],
        path: "/create",
      },
      {
        id: "nav-publish",
        label: "Publish",
        icon: '<img src="/static/icons/publish.svg" class="ct-nav-link__icon-img" alt="" />',
        view: "publish-view",
        roles: ["admin", "owner"],
        path: "/publish",
      },
      {
        id: "nav-library",
        label: "Library",
        icon: '<img src="/static/icons/library.svg" class="ct-nav-link__icon-img" alt="" />',
        view: "library-view",
        roles: ["admin", "owner", "editor"],
        path: "/library",
      },
      {
        id: "nav-workspace-settings",
        label: "Workspace Settings",
        icon: '<img src="/static/icons/settings.svg" class="ct-nav-link__icon-img" alt="" />',
        view: null,
        roles: ["admin", "owner", "editor"],
        path: "/settings/project",
      },
    ],
    activeView: initialActive,
    inspectorOpen: true,
    imagine: {
      allowedModels: initialAllowedModels,
      selectedModel: initialModelSelection,
      threadId: getStoredImagineThread(),
      threads: [],
      messages: [],
      loading: false,
      sending: false,
      attachments: [],
      error: null,
    },
    videoJob: {
      id: null,
      status: "idle",
    },
  };
  const DEFAULT_ADMIN_ROLES = ["admin", "owner", "editor", "viewer"];
  const DEFAULT_WORKSPACES = ["Default"];
  const adminUsersState = {
    initialized: false,
    loading: false,
    list: [],
    roles: DEFAULT_ADMIN_ROLES.slice(),
    workspaces: DEFAULT_WORKSPACES.slice(),
    search: "",
    selected: null,
  };
  const IMAGINE_SCROLL_THRESHOLD = 40;
  function isCurrentUserAdmin() {
    return (state.user?.role || "").toLowerCase() === "admin";
  }
  function getStoredImagineThread() {
    try {
      return localStorage.getItem(IMAGINE_THREAD_KEY) || null;
    } catch {
      return null;
    }
  }
  function setStoredImagineThread(id) {
    try {
      if (id) localStorage.setItem(IMAGINE_THREAD_KEY, id);
      else localStorage.removeItem(IMAGINE_THREAD_KEY);
    } catch {}
  }
  function resetImagineState() {
    const models = getAllowedImagineModels();
    state.imagine.threadId = null;
    state.imagine.threads = [];
    state.imagine.messages = [];
    state.imagine.loading = false;
    state.imagine.sending = false;
    state.imagine.attachments = [];
    state.imagine.error = null;
    state.imagine.allowedModels = models;
    state.imagine.selectedModel = models[0] || DEFAULT_ALLOWED_MODELS[0];
  }
  function clearImagineSession() {
    resetImagineState();
    setStoredImagineThread(null);
  }
  function syncImagineAllowedModels() {
    const latest = getAllowedImagineModels();
    const current = state.imagine.allowedModels;
    if (JSON.stringify(latest) !== JSON.stringify(current)) {
      state.imagine.allowedModels = latest;
      if (!latest.includes(state.imagine.selectedModel)) {
        state.imagine.selectedModel = latest[0] || state.imagine.selectedModel || DEFAULT_ALLOWED_MODELS[0];
      }
    }
    return state.imagine.allowedModels;
  }
  function ensureModelInAllowedList(model) {
    if (!model) return;
    if (!state.imagine.allowedModels.includes(model)) {
      state.imagine.allowedModels = [model, ...state.imagine.allowedModels];
    }
  }
  function setImagineModel(model) {
    if (!model) return;
    state.imagine.selectedModel = model;
    const select = document.getElementById("imagineModelSelect");
    if (select) select.value = model;
  }
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
      .map((item) => {
        const attrView = item.view || "";
        const isImagine = item.id === "nav-imagine";
        const isCreate = item.id === "nav-create";
        const isActive = isImagine
          ? state.inspectorOpen
          : useDarkStudio
            ? (isCreate ? CREATE_VIEW_IDS.has(state.activeView) : attrView === state.activeView)
            : attrView === state.activeView;
        const className = `ct-nav-link${isActive ? " active" : ""}`;
        return `
         <button type=\"button\" class=\"${className}\" data-view=\"${attrView}\" data-path=\"${item.path}\" id=\"${item.id}\">
           <span class=\"ct-nav-link__icon\" aria-hidden=\"true\">${item.icon || ""}</span>
           <span class=\"ct-nav-link__label label\">${item.label}</span>
         </button>`;
      })
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
              <button id="workspaceDropdownBtn" class="ct-workspace__title ghost-btn" aria-expanded="false" aria-haspopup="menu">
                <span class="ct-nav-link__icon">
                  <img src="/static/icons/workspace.svg" alt="" class="ct-nav-link__icon-img" />
                </span>
                <span id="workspaceTitleLabel" class="label"></span>
              </button>
              <div id="workspaceMenu" class="menu hidden" role="menu"></div>
              <button id="collapseSidebar" class="ct-sidebar__toggle" type="button" title="Toggle sidebar" aria-label="Toggle sidebar">
                <span class="ct-nav-link__icon">
                  <img src="/static/icons/menu-open.svg" alt="" class="ct-nav-link__icon-img" />
                </span>
              </button>
            </div>
            <nav id="ct-nav" class="ct-sidebar__nav">${renderNavItems()}</nav>
            <div class="ct-sidebar-sections">
              <section class="ct-sidebar-section" aria-label="Recents">
                <div class="ct-sidebar-section__title">Recents</div>
                <div class="ct-sidebar-section__divider"></div>
                <div class="ct-sidebar-section__body">
                  <div class="ct-sidebar-empty ct-inspector-message ct-inspector-message--system">Your recent tools will show up here...</div>
                  <ul id="ct-recents" class="ct-nav-recents"></ul>
                </div>
              </section>
              <section class="ct-sidebar-section" aria-label="Favorites">
                <div class="ct-sidebar-section__title">Favorites</div>
                <div class="ct-sidebar-section__divider"></div>
                <div class="ct-sidebar-section__body">
                  <div class="ct-sidebar-empty ct-inspector-message ct-inspector-message--system">Your favorite tools will show up here, manage under the Create...</div>
                  <ul id="ct-favorites" class="ct-nav-recents"></ul>
                </div>
              </section>
            </div>
          </div>
        </aside>
        <main id="ct-main" class="ct-main">
          <div id="notificationStack" class="notification-stack">
            <div id="verificationBanner" class="notice notice-info hidden" role="status">
              <div class="notice-accent"></div>
              <div class="notice-body">
                <span>Email verification required to unlock all creator features.</span>
                <div class="notice-actions">
                  <button id="openVerificationButton" class="ghost-btn small">Verify Now</button>
                </div>
              </div>
            </div>
            <div id="passwordResetBanner" class="notice notice-warning hidden" role="status">
              <div class="notice-accent"></div>
              <div class="notice-body">
                <span>Password update required. Update it from your profile to continue.</span>
                <div class="notice-actions">
                  <button id="openPasswordResetButton" class="ghost-btn small">Update Password</button>
                </div>
              </div>
            </div>
          </div>
          <div class="ct-main-workspace" id="ct-workspace"></div>
        </main>
        <aside id="ct-inspector" class="ct-inspector">
          <button id="toggleInspectorEdge" class="ct-inspector__toggle" type="button" aria-label="Hide Imagine panel" data-inspector-toggle>&rsaquo;</button>
          <div class="ct-inspector__inner">
            <div class="ct-inspector__bar ct-sidebar__header ct-inspector__header">
              <h2 class="ct-inspector__title">Imagine Creative Copilot</h2>
            </div>
            <div class="ct-inspector-controls">
              <div class="ct-inspector-control">
                <span class="ct-inspector-pill-heading">Model</span>
                <div class="ct-inspector-pill ct-inspector-pill--model">
                  <div class="ct-inspector-pill__value">
                    <select id="imagineModelSelect" class="ct-inspector-model-select" aria-label="Imagine model"></select>
                  </div>
                </div>
              </div>
              <div class="ct-inspector-control">
                <span class="ct-inspector-pill-heading">Thread</span>
                <button id="imagineThreadPill" class="ct-inspector-pill ct-inspector-pill--thread" type="button" aria-label="Select Imagine thread">
                  <span class="ct-inspector-pill__value" id="imagineThreadLabel">Current</span>
                  <span class="ct-inspector-pill__caret">▾</span>
                </button>
                <div id="imagineThreadMenu" class="ct-inspector-thread-menu hidden" role="menu"></div>
              </div>
            </div>
            <div class="ct-inspector__body">
              <div class="ct-inspector__chat-shell">
                <div class="ct-inspector-chat" id="imagineChat" aria-live="polite">
                  <div class="ct-inspector-chat__messages" id="imagineMessages"></div>
                  <div class="ct-inspector-chat__overlay"></div>
                  <button id="imagineScrollToBottom" class="ct-inspector-scroll-bottom" type="button">Jump to latest</button>
                </div>
                <div class="ct-inspector__footer">
                  <div class="ct-inspector-input-group">
                    <textarea
                      id="imagineInspectorInput"
                      class="ct-inspector-input"
                      placeholder="Ask the Imagine copilot for mood, prompts, or direction"
                      aria-label="Imagine message"
                    ></textarea>
                    <div class="ct-inspector-attachments" id="imagineInspectorAttachmentList"></div>
                    <div class="ct-inspector__footer-actions">
                      <input id="imagineInspectorAttachmentInput" type="file" class="visually-hidden" multiple />
                      <button id="imagineInspectorAttachBtn" class="ghost-btn" type="button">Attach</button>
                      <button id="imagineInspectorSendBtn" class="ghost-btn filled ct-inspector-send" type="button">Send</button>
                    </div>
                  </div>
                </div>
              </div>
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
    if (!state.inspectorOpen) {
      shellRoot?.classList.add("ct-shell--inspector-closed");
      shellRoot?.querySelector("#ct-inspector")?.classList.add("ct-inspector--closed");
    }
    setWorkspaceTitle(state.workspace);
    // Ensure current workspace has a lastOpened stamp if missing
    const meta = getWorkspaceMeta();
    if (!meta[state.workspace] || !meta[state.workspace].lastOpened) {
      setWorkspaceMeta(state.workspace, { lastOpened: Date.now() });
    }
  }

  function applyActiveView(viewId, opts = {}) {
    // Alias legacy create-view to new hub
    if (useDarkStudio && viewId === "create-view") viewId = "create-hub-view";
    state.activeView = viewId;
    // Update nav active state
    const canonicalCreateView = useDarkStudio ? "create-hub-view" : "create-view";
    ROOT.querySelectorAll("#ct-nav .ct-nav-link").forEach((btn) => {
      if (btn.id === "nav-imagine") {
        btn.classList.toggle("active", state.inspectorOpen);
        return;
      }
      const btnView = btn.getAttribute("data-view");
      if (!btnView) {
        btn.classList.remove("active");
        return;
      }
      const isCreateBtn = btn.id === "nav-create" || btnView === canonicalCreateView || btnView === "create-view";
      const active = useDarkStudio
        ? (isCreateBtn ? CREATE_VIEW_IDS.has(viewId) : btnView === viewId)
        : btnView === viewId;
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
      const navItem = state.nav.find((n) =>
        n.view === viewId ||
        (useDarkStudio && n.view === "create-hub-view" && CREATE_VIEW_IDS.has(viewId))
      );
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
    // Populate lists if switching into Create modules and authenticated
    try { if (state.user) hydrateCreateModuleLists(); } catch {}
  }

  function attachHandlers() {
    const shellEl = ROOT.querySelector("#ct-shell-root");
    const inspectorEl = ROOT.querySelector("#ct-inspector");
    const syncInspectorNavState = () => {
      document.getElementById("nav-imagine")?.classList.toggle("active", state.inspectorOpen);
    };
    const setInspectorVisibility = (open) => {
      if (!shellEl || !inspectorEl) return;
      state.inspectorOpen = open;
      shellEl.classList.toggle("ct-shell--inspector-closed", !open);
      inspectorEl.classList.toggle("ct-inspector--closed", !open);
      syncInspectorNavState();
    };
    const isInspectorOpen = () => state.inspectorOpen;
    setInspectorVisibility(state.inspectorOpen);

    // Side nav buttons
    ROOT.querySelectorAll("#ct-nav .ct-nav-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        if (btn.id === "nav-imagine") {
          setInspectorVisibility(!isInspectorOpen());
          return;
        }
        if (!view) {
          const directPath = btn.getAttribute("data-path");
          if (directPath) window.location.href = directPath;
          return;
        }
        applyActiveView(view, { updateHistory: true });
      });
    });

    // Also wire any topbar nav items declared in HTML
    document.querySelectorAll(".ct-topbar-nav.ct-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        if (!view) return;
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
    ROOT.querySelectorAll("[data-inspector-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => setInspectorVisibility(!isInspectorOpen()));
    });

    // Login modal using the existing overlay in templates/dashboard.html
    const openBtn = document.getElementById("openLoginButton");
    const overlay = document.getElementById("authOverlay");
    const loginForm = document.getElementById("overlayLoginForm");
    const loginEmail = document.getElementById("overlayLoginEmail");
    const loginPassword = document.getElementById("overlayLoginPassword");
    const authFeedback = document.getElementById("authFeedback");

    // Bind auth-related handlers only once because the legacy content
    // (including the login form and logout button) is preserved across
    // shell re-renders.
    if (!window.__ctAuthHandlersBound) {
      // Ensure the auth modal becomes visible when clicking the Login button.
      openBtn?.addEventListener("click", () => {
        if (!overlay) return;
        overlay.classList.remove("hidden");
        overlay.style.display = "flex"; // override display:none from CSS
      });


    // Settings shortcuts
    const verificationOverlay = document.getElementById("verificationOverlay");
    const verifyOpenProfile = document.getElementById("verifyOpenProfile");
    const goToSettings = () => {
      verificationOverlay?.classList.add("hidden");
      window.location.href = "/settings";
    };
    verifyOpenProfile?.addEventListener("click", goToSettings);

    // Notification banner actions
    const openVerBtn = document.getElementById('openVerificationButton');
    openVerBtn?.addEventListener('click', () => {
      document.getElementById('verificationOverlay')?.classList.remove('hidden');
    });
    const openPwBtn = document.getElementById('openPasswordResetButton');
    openPwBtn?.addEventListener('click', goToSettings);

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

    // Publish destination tabs
    const publishTabs = Array.from(document.querySelectorAll('.publish-tab'));
    if (publishTabs.length) {
      const setPublishTarget = (targetId) => {
        publishTabs.forEach((btn) => {
          const isActive = btn.getAttribute('data-publish-target') === targetId;
          btn.classList.toggle('active', isActive);
          btn.setAttribute('aria-selected', String(isActive));
        });
        document.querySelectorAll('.publish-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.id === targetId);
        });
      };

      publishTabs.forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.getAttribute('data-publish-target');
          if (!next) return;
          setPublishTarget(next);
        });
      });

      const initialTarget =
        publishTabs.find((b) => b.classList.contains('active') && b.getAttribute('data-publish-target'))
          ?.getAttribute('data-publish-target') ||
        publishTabs[0]?.getAttribute('data-publish-target');
      if (initialTarget) setPublishTarget(initialTarget);
    }

    // Publish: source mode toggle + upload
    const sourceRadios = Array.from(document.querySelectorAll('input[name="ytSourceMode"]'));
    const uploadGroup = document.getElementById('ytUploadGroup');
    const libraryGroup = document.getElementById('ytLibraryGroup');
    const warn = document.getElementById('publishAuthWarning');
    if (warn) warn.classList.toggle('hidden', Boolean(state.user));
    const toggleSource = () => {
      const mode = sourceRadios.find((r) => r.checked)?.value || 'upload';
      if (uploadGroup) uploadGroup.classList.toggle('hidden', mode !== 'upload');
      if (libraryGroup) libraryGroup.classList.toggle('hidden', mode !== 'library');
    };
    sourceRadios.forEach((r) => r.addEventListener('change', toggleSource));
    toggleSource();

    const librarySelect = document.getElementById('ytLibrarySelect');
    if (librarySelect && !librarySelect.dataset.loaded) {
      librarySelect.dataset.loaded = 'true';
      fetch('/youtube/library', { credentials: 'include' })
        .then((resp) => (resp.ok ? resp.json() : null))
        .then((data) => {
          if (!data?.items) return;
          data.items.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.path || item.id;
            opt.textContent = item.label || item.path;
            librarySelect.appendChild(opt);
          });
        })
        .catch(() => {});
    }

    const ytUploadBtn = document.getElementById('ytUploadBtn');
    if (ytUploadBtn) {
      ytUploadBtn.addEventListener('click', async () => {
        const formData = new FormData();
        const sourceMode = sourceRadios.find((r) => r.checked)?.value || 'upload';
        if (sourceMode === 'library') {
          const libVal = librarySelect?.value || '';
          if (!libVal) {
            toast('Select a library item', { type: 'error' });
            return;
          }
          formData.append('source_mode', 'library');
          formData.append('library_path', libVal);
        } else {
          const fileInput = document.getElementById('ytUploadFile');
          const file = fileInput?.files?.[0];
          if (!file) {
            toast('Choose a video file to upload', { type: 'error' });
            return;
          }
          formData.append('video_file', file);
        }

        const title = document.getElementById('ytTitle')?.value || '';
        if (!title.trim()) {
          toast('Title is required', { type: 'error' });
          return;
        }
        formData.append('title', title.trim());
        formData.append('description', document.getElementById('ytDesc')?.value || '');
        formData.append('tags', document.getElementById('ytTags')?.value || '');
        formData.append('privacy_status', document.getElementById('ytVisibility')?.value || 'unlisted');

        const dateVal = document.getElementById('ytPublishDate')?.value || '';
        const timeVal = document.getElementById('ytPublishTime')?.value || '';
        if (dateVal) {
          const combined = `${dateVal}${timeVal ? `T${timeVal}` : ''}`;
          formData.append('publish_at', combined);
        }

        const videoType = document.querySelector('input[name="ytVideoType"]:checked')?.value || 'standard';
        formData.append('video_type', videoType);
        const audience = document.querySelector('input[name="ytAudience"]:checked')?.value || 'not_kids';
        formData.append('made_for_kids', audience === 'kids' ? 'true' : 'false');
        formData.append('category_id', document.getElementById('ytCategory')?.value || '');
        formData.append('playlist_id', document.getElementById('ytPlaylist')?.value || '');
        const thumbFile = document.getElementById('ytThumbnailFile')?.files?.[0];
        if (thumbFile) formData.append('thumbnail_file', thumbFile);

        ytUploadBtn.disabled = true;
        ytUploadBtn.textContent = 'Uploading...';
        try {
          const resp = await fetch('/youtube/upload-form', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(txt || 'Upload failed');
          }
          toast('YouTube upload started', { type: 'success' });
        } catch (err) {
          toast(err.message || 'Upload failed', { type: 'error' });
        } finally {
          ytUploadBtn.disabled = false;
          ytUploadBtn.textContent = 'Upload to YouTube';
        }
      });
    }

    // Create video: seed / remix controls
    const seedInput = document.getElementById('videoSeed');
    const seedRandom = document.getElementById('videoSeedRandom');
    const seedLock = document.getElementById('videoSeedLock');
    if (seedRandom && seedInput) {
      seedRandom.addEventListener('click', () => {
        const rand = Math.floor(Math.random() * 1_000_000_000);
        seedInput.value = String(rand);
      });
    }
    if (seedLock) {
      seedLock.addEventListener('click', () => {
        const locked = seedLock.getAttribute('aria-pressed') === 'true';
        seedLock.setAttribute('aria-pressed', String(!locked));
        seedLock.textContent = locked ? '🔓' : '🔒';
      });
    }

    const remixControls = document.getElementById('remixControls');
    const remixRadios = Array.from(document.querySelectorAll('input[name="videoRemixMode"]'));
    remixRadios.forEach((r) =>
      r.addEventListener('change', () => {
        const mode = remixRadios.find((btn) => btn.checked)?.value || 'new';
        remixControls?.classList.toggle('hidden', mode !== 'remix');
      })
    );

    // Scenes -> base scene select link
    const videoScenesList = document.getElementById('videoScenesList');
    const baseSceneSelect = document.getElementById('videoBaseScene');
    if (videoScenesList && baseSceneSelect) {
      videoScenesList.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        const id = li.getAttribute('data-scene-id') || li.textContent || '';
        if (id && remixControls && !remixControls.classList.contains('hidden')) {
          baseSceneSelect.value = id;
        }
      });
    }

    function updateVideoStatus(info = {}) {
      const container = document.getElementById('videoStatus');
      if (!container) return;
      const pill = container.querySelector('.video-status-pill');
      const meta = container.querySelector('.video-status-meta');
      if (!pill || !meta) return;

      const status = (info.state || '').toString() || 'idle';
      const jobId = info.jobId || info.id || null;
      const progress = typeof info.progress === 'number' ? info.progress : null;

      let label = 'Idle';
      let metaText = 'Start a generation to track progress here.';
      let cls = 'video-status-pill video-status-pill--idle';

      if (status === 'starting') {
        label = 'Submitting…';
        metaText = 'Sending your prompt to Sora.';
        cls = 'video-status-pill video-status-pill--active';
      } else if (status === 'queued' || status === 'processing' || status === 'running') {
        label = status === 'queued' ? 'Queued' : 'Rendering…';
        const parts = [];
        if (jobId) parts.push(`Job ${jobId}`);
        if (progress != null) parts.push(`${progress}%`);
        metaText = parts.length ? parts.join(' • ') : 'Your clip is being rendered by Sora.';
        cls = 'video-status-pill video-status-pill--active';
      } else if (status === 'ready') {
        label = 'Ready';
        metaText = jobId
          ? `Clip is ready. Job ${jobId}. Preview and library are updated.`
          : 'Clip is ready. Preview and library are updated.';
        cls = 'video-status-pill video-status-pill--success';
      } else if (status === 'failed' || status === 'error') {
        label = 'Failed';
        metaText = info.message || 'Generation failed. Check your settings and try again.';
        cls = 'video-status-pill video-status-pill--error';
      } else if (status && status !== 'idle') {
        label = status.charAt(0).toUpperCase() + status.slice(1);
        metaText = jobId
          ? `Status: ${status}. Job ${jobId}.`
          : `Status: ${status}.`;
        cls = 'video-status-pill video-status-pill--active';
      }

      pill.textContent = label;
      pill.className = cls;
      meta.textContent = metaText;

      state.videoJob.id = jobId;
      state.videoJob.status = status;
    }

    async function pollVideoJob(ids) {
      const backendId = ids && ids.backendId ? ids.backendId : null;
      const providerId = ids && ids.providerId ? ids.providerId : null;
      if (!providerId) return;
      let attempts = 0;
      const maxAttempts = 60;
      const delayMs = 5000;
      while (attempts < maxAttempts) {
        attempts += 1;
        let resp;
        try {
          const qp = backendId
            ? `job_id=${encodeURIComponent(providerId)}&backend_job_id=${encodeURIComponent(
                backendId
              )}`
            : `job_id=${encodeURIComponent(providerId)}`;
          resp = await fetch(`/generate/video/status?${qp}`, {
            credentials: 'include',
          });
        } catch {
          updateVideoStatus({
            state: 'error',
            jobId: backendId,
            message: 'Unable to reach status endpoint.',
          });
          return;
        }
        if (!resp.ok) {
          const msg = await readErrorMessage(resp, 'Unable to check video status');
          updateVideoStatus({ state: 'error', jobId: backendId, message: msg });
          toast(msg, { type: 'error' });
          return;
        }
        let data = {};
        try {
          data = await resp.json();
        } catch {
          data = {};
        }
        const status = (data.status || '').toString() || 'unknown';
        if (status === 'queued' || status === 'processing' || status === 'running') {
          updateVideoStatus({ state: status, jobId: backendId, progress: data.progress });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        if (status === 'ready') {
          const loopPath = data.loop_path || '';
          updateVideoStatus({ state: 'ready', jobId: backendId, progress: 100 });
          if (loopPath) {
            const previewEl = document.getElementById('videoPreview');
            const cleanPath = String(loopPath).replace(/^\/+/, '');
            if (previewEl) previewEl.setAttribute('src', `/${cleanPath}`);
          }
          try {
            fetchLibrary('video');
          } catch {}
          try {
            hydrateCreateModuleLists();
          } catch {}
          toast('Video ready', { type: 'success' });
          return;
        }
        if (status === 'failed') {
          updateVideoStatus({
            state: 'failed',
            jobId: backendId,
            message: data.error || data.detail,
          });
          toast('Video generation failed', { type: 'error' });
          return;
        }
        updateVideoStatus({ state: status, jobId: backendId });
        return;
      }
      updateVideoStatus({
        state: 'error',
        jobId: backendId,
        message: 'Timed out waiting for Sora.',
      });
      toast('Timed out waiting for video to finish.', { type: 'error' });
    }

    // Video generate
    const videoGenerateBtn = document.getElementById('videoGenerateBtn');
    if (videoGenerateBtn) {
      videoGenerateBtn.addEventListener('click', async () => {
        const prompt = document.getElementById('videoPrompt')?.value || '';
        if (!prompt.trim()) {
          toast('Prompt is required', { type: 'error' });
          return;
        }
        const duration = parseInt(document.getElementById('videoDuration')?.value || '8', 10);
        const size = document.getElementById('videoSize')?.value || '720x1280';
        const loop = document.getElementById('videoLoop')?.checked || false;
        const videoType =
          document.querySelector('input[name="videoType"]:checked')?.value || 'standard';
        const style = document.getElementById('videoStyle')?.value || 'none';
        const motion = document.getElementById('videoMotion')?.value || 'auto';
        const seedVal = seedInput?.value ? parseInt(seedInput.value, 10) : null;
        const remixMode = (remixRadios.find((r) => r.checked)?.value || 'new') === 'remix';
        const baseScene = document.getElementById('videoBaseScene')?.value || '';
        const remixStrength = document.getElementById('videoRemixStrength')?.value || '';

        if (videoType === 'short' && duration > 60) {
          toast('Shorts should be 60s or less; consider lowering duration.', { type: 'info' });
        }
        if (videoType === 'short' && size) {
          const [w, h] = size.split('x').map((n) => parseInt(n, 10));
          if (w && h && w > h) toast('Shorts work best in vertical aspect ratios.', { type: 'info' });
        }

        const payload = {
          prompt: prompt.trim(),
          duration_seconds: duration,
          size,
          loop_hint: loop,
          video_type: videoType,
          style_preset: style,
          camera_motion: motion,
          seed: seedLock?.getAttribute('aria-pressed') === 'true' ? seedVal || null : seedVal || null,
          remix_mode: remixMode,
          base_scene_id: remixMode ? baseScene : null,
          remix_strength: remixMode && remixStrength ? Number(remixStrength) : null,
        };

        videoGenerateBtn.disabled = true;
        videoGenerateBtn.textContent = 'Generating...';
        updateVideoStatus({ state: 'starting' });
        try {
          const resp = await fetch('/generate/video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          if (!resp.ok) {
            const message = await readErrorMessage(resp, 'Generation failed');
            updateVideoStatus({ state: 'failed', message });
            throw new Error(message);
          }
          const ctype = (resp.headers.get('Content-Type') || '').toLowerCase();
          let data = {};
          if (ctype.includes('application/json')) {
            data = await resp.json().catch(() => ({}));
          } else {
            const text = await resp.text().catch(() => '');
            try {
              data = text ? JSON.parse(text) : {};
            } catch {
              data = {};
            }
          }
          if (data && data.ok === false) {
            const message = data?.detail || data?.error || 'Generation failed';
            updateVideoStatus({ state: 'failed', message });
            throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
          }
          const status = (data.status || '').toString() || 'unknown';
          const backendJobId = data.job_id || null;
          const providerJobId = data.provider_job_id || null;
          const loopPath = data.loop_path || null;
          if (loopPath) {
            const previewEl = document.getElementById('videoPreview');
            const cleanPath = String(loopPath).replace(/^\/+/, '');
            if (previewEl) previewEl.setAttribute('src', `/${cleanPath}`);
          }
          if (
            backendJobId &&
            (status === 'queued' ||
              status === 'processing' ||
              status === 'running' ||
              status === 'completed')
          ) {
            updateVideoStatus({
              state: status,
              jobId: backendJobId,
              progress: data.progress,
            });
            pollVideoJob({ backendId: backendJobId, providerId: providerJobId || null });
          } else if (status === 'ready' || loopPath) {
            updateVideoStatus({
              state: 'ready',
              jobId: backendJobId,
              progress: 100,
            });
          } else {
            updateVideoStatus({ state: status, jobId: backendJobId });
          }
          toast('Video generation started', { type: 'success' });
          const previewEl = document.getElementById('videoPreview');
          if (!loopPath && data.loop_path && previewEl) {
            const cleanPath = String(data.loop_path).replace(/^\/+/, '');
            previewEl.setAttribute('src', `/${cleanPath}`);
          }
        } catch (err) {
          toast(err.message || 'Generation failed', { type: 'error' });
        } finally {
          videoGenerateBtn.disabled = false;
          videoGenerateBtn.textContent = 'Generate Video';
        }
      });
    }
    // Library view: fetch assets
    const libraryGrid = document.getElementById('libraryGrid');
    const libraryTabs = Array.from(document.querySelectorAll('.library-tab'));
    const renderLibraryPlaceholder = (text) => {
      if (libraryGrid) libraryGrid.innerHTML = `<div class="dashboard-placeholder">${text}</div>`;
    };

    const fetchLibrary = (type) => {
      if (!libraryGrid) return;
      if (!state.user) {
        renderLibraryPlaceholder('Sign in to load your library.');
        return;
      }
      renderLibraryPlaceholder('Loading your library...');
      const qp = type ? `?asset_type=${encodeURIComponent(type)}` : '';
      fetch(`/library${qp}`, { credentials: 'include' })
        .then((resp) => (resp.ok ? resp.json() : null))
        .then((data) => {
          if (!data?.items || data.items.length === 0) {
            renderLibraryPlaceholder('No assets yet. Generate video or music to see them here.');
            return;
          }
          libraryGrid.innerHTML = data.items
            .map(
              (item) => `
                <div class="library-card">
                  <div class="library-card__meta">
                    <span class="library-badge">${item.type || 'asset'}</span>
                  </div>
                  <h3 class="library-card__title">${item.label || item.path}</h3>
                  <span class="help-text">${item.path}</span>
                </div>
              `
            )
            .join('');
        })
        .catch(() => renderLibraryPlaceholder('Unable to load library.'));
    };

    if (libraryGrid) {
      libraryGrid.dataset.loaded = 'true';
      const activeTab = libraryTabs.find((btn) => btn.classList.contains('active'));
      fetchLibrary(activeTab?.getAttribute('data-asset-type') || 'video');
    }

    libraryTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-asset-type');
        libraryTabs.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-selected', String(isActive));
        });
        fetchLibrary(type);
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
          toast('Logged in', { type: 'success' });
          if (loginEmail) loginEmail.value = "";
          if (loginPassword) loginPassword.value = "";
          await fetchMeAndUpdateUI();
        } catch (err) {
          if (authFeedback)
            authFeedback.textContent = err.message || "Login failed";
          toast(err.message || 'Login failed', { type: 'error' });
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
          clearImagineSession();
          renderShell();
          attachHandlers();
          try { await fetchMeAndUpdateUI(); } catch {}
          toast('Logged out', { type: 'info' });
        });

      window.__ctAuthHandlersBound = true;
    }

    // Workspace dropdown behaviors
    const ddBtn = document.getElementById("workspaceDropdownBtn");
    const menu = document.getElementById("workspaceMenu");
    ddBtn?.addEventListener("click", () => {
      const open = ddBtn.getAttribute("aria-expanded") === "true";
      ddBtn.setAttribute("aria-expanded", String(!open));
      if (menu) menu.classList.toggle("hidden", open);
    });
    if (!window.__ctOutsideCloseBound) {
      document.addEventListener("click", (e) => {
        const btnLive = document.getElementById("workspaceDropdownBtn");
        const menuLive = document.getElementById("workspaceMenu");
        if (!btnLive || !menuLive) return;
        const t = e.target;
        const clickedInside = btnLive.contains(t) || menuLive.contains(t);
        if (!clickedInside) {
          btnLive.setAttribute("aria-expanded", "false");
          menuLive.classList.add("hidden");
        }
      });
      window.__ctOutsideCloseBound = true;
    }

    // Global click handler for workspace actions
    if (!window.__ctActionHandlerBound) {
      document.addEventListener("click", (e) => {
        const t = e.target.closest("[data-action]");
        if (!t) return;
        const action = t.getAttribute("data-action");
        if (action === "open-auth") {
          const ov = document.getElementById("authOverlay");
          if (ov) {
            ov.classList.remove("hidden");
            ov.style.display = 'flex';
          }
          return;
        }
        if (action === "open-workspace-create") {
          document.getElementById("createWorkspaceModal")?.classList.remove("hidden");
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
          try { localStorage.setItem('activeWorkspace', name); } catch {}
          state.workspace = name;
          try {
            resetImagineState();
            renderImaginePanel();
          } catch {}
          state.pending = "";
          setWorkspaceTitle(name);
          try { setWorkspaceMeta(name, { lastOpened: Date.now() }); } catch {}
          document.getElementById("confirmSwitchModal")?.classList.add("hidden");
          const qs = `?ws=${encodeURIComponent(name)}`;
          window.location.href = "/settings/project" + qs;
        }
      });
      window.__ctActionHandlerBound = true;
    }
    mountImagineInspector();
    // Load workspaces
    loadWorkspaces();
  }

  function applyDashboardIdentity(opts = {}) {
    const nameRaw = (opts.name || "").toString().trim();
    const name = nameRaw || "Creator";
    const roleRaw = (opts.role || "").toString();
    const role =
      roleRaw && roleRaw.length ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1) : "Viewer";
    const workspace = opts.workspace || state.workspace || "Default";
    const avatarInitial = (name.match(/[A-Za-z]/)?.[0] || name.charAt(0) || "C").toUpperCase();

    const welcome = document.getElementById("dashboardWelcome");
    if (welcome) {
      welcome.textContent = opts.isSignedIn ? `Welcome back, ${name}` : "Welcome to Creator Toolkit";
    }
    const subhead = document.getElementById("dashboardSubhead");
    if (subhead) {
      subhead.textContent = opts.isSignedIn
        ? "Here’s an overview of your recent activity and provider status."
        : "Sign in to access your workspace overview and connected providers.";
    }
    const info = document.getElementById("dashboardInfo");
    if (info) info.classList.toggle("hidden", !!opts.isSignedIn);
    const accountName = document.getElementById("dashboardAccountName");
    if (accountName) accountName.textContent = opts.isSignedIn ? name : "Signed out";
    const avatar = document.getElementById("dashboardAvatar");
    if (avatar) avatar.textContent = avatarInitial;

    const roleTargets = [
      document.getElementById("dashboardRoleBadge"),
      document.getElementById("dashboardRoleBadgeSecondary"),
    ].filter(Boolean);
    roleTargets.forEach((el) => {
      el.textContent = role;
    });

    const wsTargets = [
      document.getElementById("dashboardWorkspaceBadge"),
      document.getElementById("dashboardWorkspaceBadgeSecondary"),
    ].filter(Boolean);
    wsTargets.forEach((el) => {
      el.textContent = `Workspace: ${workspace}`;
    });
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
    try {
      if (me?.id || me?.email || me?.username) {
        const key = sanitizeKeyPart(me.id || me.email || me.username, "guest");
        localStorage.setItem("ctUserKey", key);
      } else {
        localStorage.removeItem("ctUserKey");
      }
    } catch {}
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
      applyDashboardIdentity({
        name: me.full_name || me.display_name || me.email || "Creator",
        role: me.role,
        workspace: state.workspace,
        isSignedIn: true,
      });
    } else {
      userActions?.classList.add("hidden");
      auth?.classList.remove("hidden");
      docsLink?.classList.add("hidden");
      applyDashboardIdentity({
        name: "Creator",
        role: "Viewer",
        workspace: state.workspace,
        isSignedIn: false,
      });
    }

    // Re-render shell to apply role filters on nav while preserving views
    renderShell();
    attachHandlers();
    hydrateSettingsPanels();
    // Populate recent lists only when authenticated
    if (me) {
      try { await hydrateCreateModuleLists(); } catch {}
      try { await hydrateDashboard(); } catch {}
    }
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

  function mountImagineInspector() {
    const chat = document.getElementById("imagineChat");
    if (!chat) return;
    const sendBtn = document.getElementById("imagineInspectorSendBtn");
    const input = document.getElementById("imagineInspectorInput");
    const attachBtn = document.getElementById("imagineInspectorAttachBtn");
    const fileInput = document.getElementById("imagineInspectorAttachmentInput");
    const scrollBtn = document.getElementById("imagineScrollToBottom");
    const threadPill = document.getElementById("imagineThreadPill");
    const threadMenu = document.getElementById("imagineThreadMenu");
    const modelSelect = document.getElementById("imagineModelSelect");

    sendBtn?.addEventListener("click", handleImagineSend);
    input?.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleImagineSend();
      }
    });
    attachBtn?.addEventListener("click", () => {
      if (!state.user) {
        toast('Sign in to attach references', { type: 'info' });
        return;
      }
      fileInput?.click();
    });
    fileInput?.addEventListener("change", handleImagineAttachmentChange);
    modelSelect?.addEventListener("change", (event) => {
      const value = event.target.value;
      if (value) setImagineModel(value);
    });
    chat.addEventListener("scroll", () => {
      updateImagineScrollControls(chat);
    });
    scrollBtn?.addEventListener("click", () => {
      chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
      chat.classList.remove("ct-inspector-chat--has-unread");
      updateImagineScrollControls(chat);
    });
    threadPill?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!threadMenu) return;
      const isOpen = !threadMenu.classList.contains("hidden");
      document.querySelectorAll(".ct-inspector-thread-menu").forEach((menu) => menu.classList.add("hidden"));
      if (!isOpen) {
        renderImagineThreadMenu();
        threadMenu.classList.remove("hidden");
      }
    });
    document.addEventListener("click", (event) => {
      if (!threadMenu || threadMenu.classList.contains("hidden")) return;
      if (threadMenu.contains(event.target) || threadPill?.contains(event.target)) return;
      threadMenu.classList.add("hidden");
    });
    requestAnimationFrame(() => updateImagineScrollControls(chat));

    renderImaginePanel();
    bootstrapImagineInspector();
  }

  async function bootstrapImagineInspector() {
    if (!document.getElementById("imagineMessages")) return;
    renderImaginePanel();
    if (!state.user) return;
    try {
      await ensureImagineThread();
      await hydrateImagineHistory();
    } catch (err) {
      if (!state.imagine.threadId) {
        try {
          await ensureImagineThread();
          await hydrateImagineHistory();
          return;
        } catch (inner) {
          state.imagine.error = inner.message || "Unable to load Imagine.";
        }
      } else {
        state.imagine.error = err.message || "Unable to load Imagine.";
      }
      renderImaginePanel();
    }
  }

  async function ensureImagineThread() {
    if (!state.user) throw new Error("Sign in to use Imagine.");
    if (state.imagine.threadId) return state.imagine.threadId;
    const stored = getStoredImagineThread();
    if (stored) {
      state.imagine.threadId = stored;
      return stored;
    }
    const threads = await fetchImagineThreads();
    if (threads.length) {
      state.imagine.threadId = threads[0].id;
      setStoredImagineThread(state.imagine.threadId);
      return state.imagine.threadId;
    }
    const created = await createImagineThread();
    state.imagine.threadId = created;
    setStoredImagineThread(created);
    return created;
  }

  async function fetchImagineThreads() {
    const resp = await fetch("/imagine/threads", { credentials: "include" });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp, "Unable to load threads"));
    }
    const data = await resp.json();
    const threads = Array.isArray(data.threads) ? data.threads : [];
    state.imagine.threads = threads;
    const active =
      threads.find((t) => t.id === state.imagine.threadId) ||
      threads[0];
    if (active?.model) {
      ensureModelInAllowedList(active.model);
      state.imagine.selectedModel = active.model;
    }
    return threads;
  }

  async function createImagineThread(title) {
    const payload = {
      model: state.imagine.selectedModel || getAllowedImagineModels()[0] || DEFAULT_ALLOWED_MODELS[0],
      title:
        title ||
        `Session ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    };
    const resp = await fetch("/imagine/thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp, "Unable to start Imagine thread"));
    }
    const data = await resp.json();
    const id = data.thread_id;
    if (!id) throw new Error("Missing thread id");
    ensureModelInAllowedList(payload.model);
    state.imagine.threads = [{ id, title: payload.title, model: payload.model }, ...state.imagine.threads];
    return id;
  }

  async function hydrateImagineHistory() {
    if (!state.imagine.threadId) return;
    state.imagine.loading = true;
    state.imagine.error = null;
    renderImaginePanel();
    try {
      const resp = await fetch(`/imagine/history/${state.imagine.threadId}`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const msg = await readErrorMessage(resp, "Unable to load Imagine history");
        if (resp.status === 403 || resp.status === 404) {
          clearImagineSession();
        }
        throw new Error(msg);
      }
      const data = await resp.json();
      const threadModel = data.thread?.model;
      if (threadModel) {
        ensureModelInAllowedList(threadModel);
        state.imagine.selectedModel = threadModel;
      }
      const list = Array.isArray(data.messages) ? data.messages : [];
      state.imagine.messages = list.map((msg, idx) => ({
        id: msg.created_at ? `msg-${msg.created_at}-${idx}` : `msg-${Date.now()}-${idx}`,
        role: (msg.role || "assistant").toLowerCase(),
        content: msg.content || "",
        created_at: msg.created_at || null,
      }));
    } catch (err) {
      state.imagine.messages = [];
      state.imagine.error = err.message || "Unable to load Imagine chat.";
      throw err;
    } finally {
      state.imagine.loading = false;
      renderImaginePanel();
      scrollImagineToBottom(true);
    }
  }

  async function handleImagineSend() {
    if (state.imagine.sending) return;
    const input = document.getElementById("imagineInspectorInput");
    if (!input) return;
    const raw = (input.value || "").trim();
    if (!raw) return;
    if (!state.user) {
      toast('Sign in to use Imagine', { type: 'info' });
      return;
    }
    try {
      await ensureImagineThread();
    } catch (err) {
      state.imagine.error = err.message || "Unable to start Imagine.";
      renderImaginePanel();
      toast(state.imagine.error, { type: 'error' });
      return;
    }
    const message = formatImagineMessage(raw);
    if (!message) return;
    const pending = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      pending: true,
    };
    state.imagine.messages.push(pending);
    state.imagine.sending = true;
    state.imagine.error = null;
    renderImaginePanel();
    scrollImagineToBottom(true);
    try {
      const resp = await fetch("/imagine/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          thread_id: state.imagine.threadId,
          message,
        }),
      });
      if (!resp.ok) {
        const msg = await readErrorMessage(resp, "Imagine request failed");
        throw new Error(msg);
      }
      const data = await resp.json();
      pending.pending = false;
      const reply = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply || "",
      };
      state.imagine.messages.push(reply);
      state.imagine.attachments = [];
      input.value = "";
      renderImaginePanel();
      scrollImagineToBottom(true);
    } catch (err) {
      pending.pending = false;
      state.imagine.messages.push({
        id: `error-${Date.now()}`,
        role: "error",
        content: err.message || "Imagine request failed.",
      });
      toast(err.message || 'Imagine request failed.', { type: 'error' });
      renderImaginePanel();
      scrollImagineToBottom(true);
    } finally {
      state.imagine.sending = false;
      renderImaginePanel();
    }
  }

  async function handleImagineNewThread() {
    if (!state.user) {
      toast('Sign in to start a new thread', { type: 'info' });
      return;
    }
    try {
      const now = new Date();
      const title = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
      const threadId = await createImagineThread(title);
      state.imagine.threadId = threadId;
      setStoredImagineThread(threadId);
      state.imagine.messages = [];
      state.imagine.attachments = [];
      renderImaginePanel();
      await hydrateImagineHistory();
      toast('New Imagine thread ready', { type: 'success' });
    } catch (err) {
      state.imagine.error = err.message || "Unable to create thread.";
      renderImaginePanel();
      toast(state.imagine.error, { type: 'error' });
    }
  }

  function handleImagineAttachmentChange(event) {
    const input = event?.target;
    if (!input || !state.user) {
      if (input) input.value = "";
      return;
    }
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const next = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
    }));
    state.imagine.attachments = [...state.imagine.attachments, ...next].slice(-5);
    input.value = "";
    renderImaginePanel();
  }

  function removeImagineAttachment(id) {
    state.imagine.attachments = state.imagine.attachments.filter((item) => item.id !== id);
    renderImaginePanel();
  }

  function formatImagineMessage(raw) {
    const text = raw.trim();
    if (!text) return "";
    if (!state.imagine.attachments.length) return text;
    const names = state.imagine.attachments.map((item) => item.name).join(", ");
    return `${text}\n\n[Attached references: ${names}]`;
  }

  function renderImaginePanel() {
    const chat = document.getElementById("imagineMessages");
    if (!chat) return;
    const input = document.getElementById("imagineInspectorInput");
    const sendBtn = document.getElementById("imagineInspectorSendBtn");
    const attachBtn = document.getElementById("imagineInspectorAttachBtn");
    const attachmentList = document.getElementById("imagineInspectorAttachmentList");
    const modelSelect = document.getElementById("imagineModelSelect");
    const threadLabel = document.getElementById("imagineThreadLabel");
    const allowedModels = syncImagineAllowedModels();
    const activeModel = state.imagine.selectedModel || allowedModels[0] || DEFAULT_ALLOWED_MODELS[0];
    const modelOptions = allowedModels.length ? allowedModels.slice() : DEFAULT_ALLOWED_MODELS.slice();
    if (activeModel && !modelOptions.includes(activeModel)) modelOptions.unshift(activeModel);
    if (!state.imagine.selectedModel && activeModel) state.imagine.selectedModel = activeModel;
    const activeThread = state.imagine.threads.find((t) => t.id === state.imagine.threadId);
    const canChat = Boolean(state.user);
    const sending = state.imagine.sending;
    const loading = state.imagine.loading;

    if (input) {
      input.disabled = !canChat || sending;
      if (!canChat && input.value) input.value = "";
      input.placeholder = canChat
        ? "Ask the Imagine copilot for mood, prompts, or direction"
        : "Sign in to chat with Imagine";
    }
    if (modelSelect) {
      modelSelect.innerHTML = modelOptions
        .map((model) => `<option value="${model}">${model}</option>`)
        .join("");
      if (activeModel) modelSelect.value = activeModel;
      modelSelect.disabled = !canChat || loading;
    }
    if (sendBtn) {
      sendBtn.disabled = !canChat || sending;
      sendBtn.textContent = sending ? "Sending…" : "Send";
    }
    if (attachBtn) attachBtn.disabled = !canChat || sending;
    if (threadLabel) threadLabel.textContent = activeThread?.title || "Current thread";

    if (attachmentList) {
      attachmentList.innerHTML = "";
      attachmentList.hidden = !state.imagine.attachments.length;
      state.imagine.attachments.forEach((item) => {
        const pill = document.createElement("span");
        pill.className = "ct-inspector-attachment-pill";
        pill.textContent = item.name;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ct-inspector-attachment-pill__remove";
        removeBtn.setAttribute("aria-label", `Remove ${item.name}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => removeImagineAttachment(item.id));
        pill.appendChild(removeBtn);
        attachmentList.appendChild(pill);
      });
    }

    chat.innerHTML = "";
    if (!canChat) {
      const p = document.createElement("p");
      p.className = "ct-inspector-message ct-inspector-message--system";
      p.textContent = "Sign in to resume your Imagine threads.";
      chat.appendChild(p);
      requestAnimationFrame(() => updateImagineScrollControls(document.getElementById("imagineChat")));
      return;
    }
    if (!state.imagine.messages.length) {
      const p = document.createElement("p");
      p.className = "ct-inspector-message ct-inspector-message--system";
      p.textContent = loading
        ? "Loading your latest Imagine thread…"
        : "Describe the vibe, mood, or creative ask to begin.";
      chat.appendChild(p);
      requestAnimationFrame(() => updateImagineScrollControls(document.getElementById("imagineChat")));
      return;
    }
    state.imagine.messages.forEach((msg) => {
      const role = (msg.role || "assistant").toLowerCase();
      const bubble = document.createElement("div");
      bubble.className = `ct-inspector-message ct-inspector-message--${role}`;
      if (msg.pending) bubble.classList.add("is-pending");
      bubble.textContent = msg.content || "";
      chat.appendChild(bubble);
    });
    requestAnimationFrame(() => updateImagineScrollControls(document.getElementById("imagineChat")));
  }

  function renderImagineThreadMenu() {
    const menu = document.getElementById("imagineThreadMenu");
    if (!menu) return;
    const canChat = Boolean(state.user);
    menu.innerHTML = "";
    if (!canChat) {
      const p = document.createElement("p");
      p.className = "ct-inspector-thread-menu__empty";
      p.textContent = "Sign in to manage threads.";
      menu.appendChild(p);
      return;
    }
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "ct-inspector-thread-menu__item is-primary";
    newBtn.textContent = "New Thread";
    newBtn.addEventListener("click", async () => {
      menu.classList.add("hidden");
      await handleImagineNewThread();
    });
    menu.appendChild(newBtn);

    if (!state.imagine.threads.length) {
      const empty = document.createElement("p");
      empty.className = "ct-inspector-thread-menu__empty";
      empty.textContent = "No threads yet.";
      menu.appendChild(empty);
      return;
    }

    state.imagine.threads.forEach((thread) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ct-inspector-thread-menu__item";
      btn.textContent = thread.title || "Untitled thread";
      if (thread.id === state.imagine.threadId) {
        btn.classList.add("is-active");
      }
      btn.addEventListener("click", () => {
        selectImagineThread(thread.id);
        menu.classList.add("hidden");
      });
      menu.appendChild(btn);
    });
  }

  async function selectImagineThread(threadId) {
    if (!threadId) return;
    if (threadId === state.imagine.threadId) return;
    state.imagine.threadId = threadId;
    setStoredImagineThread(threadId);
    state.imagine.messages = [];
    state.imagine.attachments = [];
    renderImaginePanel();
    await hydrateImagineHistory();
    scrollImagineToBottom(true);
  }

  function updateImagineScrollControls(existingChat) {
    const chat = existingChat || document.getElementById("imagineChat");
    const scrollBtn = document.getElementById("imagineScrollToBottom");
    if (!chat) return;
    const distanceFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    const nearBottom = distanceFromBottom < IMAGINE_SCROLL_THRESHOLD;
    if (nearBottom) {
      chat.classList.remove("ct-inspector-chat--has-unread");
      scrollBtn?.classList.remove("ct-inspector-scroll-bottom--visible");
    } else {
      chat.classList.add("ct-inspector-chat--has-unread");
      scrollBtn?.classList.add("ct-inspector-scroll-bottom--visible");
    }
  }

  function scrollImagineToBottom(force) {
    const chat = document.getElementById("imagineChat");
    if (!chat) return;
    const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
    if (force || nearBottom) {
      chat.scrollTop = chat.scrollHeight;
      chat.classList.remove("ct-inspector-chat--has-unread");
    } else {
      chat.classList.add("ct-inspector-chat--has-unread");
    }
    updateImagineScrollControls(chat);
  }

  async function readErrorMessage(resp, fallback = "Request failed") {
    try {
      const text = await resp.text();
      if (!text) return fallback;
      try {
        const data = JSON.parse(text);
        if (typeof data === "string") return data;
        return data.detail || data.error || fallback;
      } catch {
        return text;
      }
    } catch {
      return fallback;
    }
  }

  // Expose for template-level tab controls
  window.applyActiveView = applyActiveView;
  window.setDarkStudioEnabled = function (enabled) {
    try { localStorage.setItem('useDarkStudio', enabled ? 'true' : 'false'); } catch {}
    // Recompute and reload for simplicity
    window.location.reload();
  }

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
      window.__ctActionHandlerBound = true;
    });
  }

  // --- Dashboard panel hydration (role + providers + profile summary) ---
  async function hydrateDashboard() {
    const r = await fetch('/dashboard/data', { credentials: 'include' });
    if (!r.ok) return;
    const data = await r.json();
    const roleRaw = (data.user?.role || '').toString();
    const role = roleRaw ? (roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1)) : 'Viewer';
    applyDashboardIdentity({
      name: data.user?.display_name || data.user?.email || "Creator",
      role,
      workspace: state.workspace,
      isSignedIn: true,
    });
    // Providers grid
    const grid = document.getElementById('dashboardProviders');
    const providers = data.providers || {};
    if (grid) {
      grid.innerHTML = '';
      ['openai','elevenlabs','youtube'].forEach((key) => {
        const status = (providers[key] || 'missing').toString();
        const row = document.createElement('div');
        row.className = 'status-row';
        const label = document.createElement('span');
        let friendly = key;
        if (key === "openai") friendly = "OpenAI";
        else if (key === "elevenlabs") friendly = "ElevenLabs";
        else if (key === "youtube") friendly = "YouTube";
        label.textContent = friendly;
        const pill = document.createElement('span');
        pill.className = `status-pill ${status === 'connected' ? 'connected' : 'missing'}`;
        pill.textContent = status === 'connected' ? 'Connected' : 'Missing';
        row.appendChild(label);
        row.appendChild(pill);
        grid.appendChild(row);
      });
    }
    // Profile summary
    const list = document.getElementById('dashboardProfileList');
    if (list) {
      list.innerHTML = '';
      const pairs = [
        ['Name', data.user?.display_name || '—'],
        ['Email', data.user?.email || '—'],
        ['Access', data.user?.access_group || '—'],
      ];
      pairs.forEach(([k,v]) => {
        const li = document.createElement('li');
        const a = document.createElement('span');
        a.className = 'label';
        a.textContent = k;
        const b = document.createElement('span');
        b.textContent = v;
        li.appendChild(a);
        li.appendChild(b);
        list.appendChild(li);
      });
    }

    // Active jobs list
    const activeJobsList = document.getElementById('activeJobsList');
    if (activeJobsList) {
      const activeJobs = Array.isArray(data.active_jobs) ? data.active_jobs : [];
      activeJobsList.innerHTML = '';
      if (!activeJobs.length) {
        const p = document.createElement('p');
        p.className = 'dashboard-placeholder';
        p.textContent = 'No active jobs.';
        activeJobsList.appendChild(p);
      } else {
        activeJobs.forEach((job) => {
          const row = document.createElement('div');
          row.className = 'jobs-list-row';
          const title = document.createElement('div');
          title.className = 'jobs-list-title';
          title.textContent = job.type || 'job';
          const meta = document.createElement('div');
          meta.className = 'jobs-list-meta';
          const status = job.status || '';
          const stage = job.stage || '';
          const progress =
            typeof job.progress === 'number' ? `${job.progress}%` : '';
          const updated =
            formatRelativeTime(job.updated_at) || job.updated_at || '';
          meta.textContent = [status, stage, progress, updated]
            .filter(Boolean)
            .join(' • ');
          row.appendChild(title);
          row.appendChild(meta);
          activeJobsList.appendChild(row);
        });
      }
    }

    // Recent jobs table
    const recentJobsBody = document.getElementById('recentJobsBody');
    if (recentJobsBody) {
      const jobs = Array.isArray(data.recent_jobs) ? data.recent_jobs : [];
      if (!jobs.length) {
        recentJobsBody.innerHTML =
          '<tr><td colspan="6" class="dashboard-placeholder">No recent jobs yet.</td></tr>';
      } else {
        recentJobsBody.innerHTML = jobs
          .map((job) => {
            const id = job.id || '';
            const type = job.type || 'job';
            const status = job.status || '—';
            const stage = job.stage || '—';
            const progress =
              typeof job.progress === 'number' ? `${job.progress}%` : '—';
            const updated =
              formatRelativeTime(job.updated_at) || job.updated_at || '—';
            return `
              <tr>
                <td>${id}</td>
                <td>${type}</td>
                <td>${status}</td>
                <td>${stage}</td>
                <td>${progress}</td>
                <td>${updated}</td>
              </tr>
            `;
          })
          .join('');
      }
    }

    // Recent assets list
    const recentAssetsList = document.getElementById('recentAssetsList');
    if (recentAssetsList) {
      let assets = Array.isArray(data.recent_assets) ? data.recent_assets : [];
      if (!assets.length) {
        try {
          const resp = await fetch('/library?limit=8', { credentials: 'include' });
          if (resp.ok) {
            const lib = await resp.json();
            if (Array.isArray(lib.items)) assets = lib.items;
          }
        } catch {
          // ignore and fall through to placeholder
        }
      }
      recentAssetsList.innerHTML = '';
      if (!assets.length) {
        const li = document.createElement('li');
        li.className = 'dashboard-placeholder';
        li.textContent = 'No recent assets yet.';
        recentAssetsList.appendChild(li);
      } else {
        assets.forEach((asset) => {
          const li = document.createElement('li');
          li.className = 'dashboard-list-item';
          const primary = document.createElement('div');
          primary.className = 'dashboard-list-primary';
          primary.textContent =
            asset.label ||
            asset.title ||
            asset.path ||
            asset.id ||
            'Asset';
          const meta = document.createElement('div');
          meta.className = 'dashboard-list-meta';
          const type = asset.type || asset.asset_type || '';
          const path = asset.path || '';
          meta.textContent = [type, path].filter(Boolean).join(' • ');
          li.appendChild(primary);
          li.appendChild(meta);
          recentAssetsList.appendChild(li);
        });
      }
    }
  }

  function hydrateSettingsPanels() {
    const usersSection = document.getElementById("settings-users");
    const tabButtons = document.querySelectorAll('.ct-tab[data-view="settings-users"]');
    const isAdmin = isCurrentUserAdmin();
    tabButtons.forEach((btn) => {
      if (isAdmin) btn.classList.remove("hidden");
      else btn.classList.add("hidden");
    });
    if (!usersSection) return;
    if (!isAdmin) {
      usersSection.classList.add("hidden");
      document.getElementById("adminUsersPanel")?.classList.add("hidden");
      document.getElementById("adminUsersRestricted")?.classList.remove("hidden");
      return;
    }
    usersSection.classList.remove("hidden");
    document.getElementById("adminUsersRestricted")?.classList.add("hidden");
    document.getElementById("adminUsersPanel")?.classList.remove("hidden");
    initAdminUsersPanel().catch(() => {});
  }

  async function initAdminUsersPanel() {
    if (!isCurrentUserAdmin()) return;
    const panel = document.getElementById("adminUsersPanel");
    if (!panel) return;
    if (!adminUsersState.initialized) {
      adminUsersState.initialized = true;
      const tbody = document.getElementById("adminUsersTableBody");
      tbody?.addEventListener("click", (event) => {
        const row = event.target.closest("tr[data-user-id]");
        if (!row) return;
        const id = Number(row.getAttribute("data-user-id"));
        if (id) {
          event.preventDefault();
          selectAdminUser(id);
        }
      });
      const searchForm = document.getElementById("adminUsersSearchForm");
      searchForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const term = (document.getElementById("adminUsersSearchInput")?.value || "").trim();
        adminUsersState.search = term;
        refreshAdminUsersList(term);
      });
      document.getElementById("adminUsersRefreshBtn")?.addEventListener("click", () => {
        refreshAdminUsersList(adminUsersState.search);
      });
      document.getElementById("adminUsersCreateToggle")?.addEventListener("click", () =>
        toggleCreateUserCard(true)
      );
      document.getElementById("adminCreateCancel")?.addEventListener("click", () =>
        toggleCreateUserCard(false)
      );
      document.getElementById("adminCreateGeneratePassword")?.addEventListener("change", (event) => {
        const checked = event.target.checked;
        const field = document.getElementById("adminCreatePasswordField");
        const input = document.getElementById("adminCreatePassword");
        if (field) field.classList.toggle("hidden", checked);
        if (input) {
          input.disabled = checked;
          if (checked) input.value = "";
        }
      });
      document.getElementById("adminCreateUserForm")?.addEventListener("submit", handleAdminCreateUser);
      document.getElementById("adminUserDetailForm")?.addEventListener("submit", handleAdminUserUpdate);
      document.getElementById("adminUserPasswordForm")?.addEventListener(
        "submit",
        handleAdminUserPasswordChange,
      );
      populateAdminRoleOptions();
      applyAdminWorkspaceOptions();
      await refreshAdminWorkspaceOptions();
    }
    await refreshAdminUsersList(adminUsersState.search);
  }

  async function refreshAdminUsersList(query) {
    if (!isCurrentUserAdmin()) return;
    const tbody = document.getElementById("adminUsersTableBody");
    if (!tbody) return;
    adminUsersState.loading = true;
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    try {
      const resp = await fetch(`/admin/users${params}`, { credentials: "include" });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Unable to load users"));
      }
      const data = await resp.json();
      adminUsersState.list = Array.isArray(data.users) ? data.users : [];
      const roles = Array.isArray(data.roles) && data.roles.length
        ? data.roles
        : DEFAULT_ADMIN_ROLES.slice();
      adminUsersState.roles = roles;
      renderAdminUsersTable();
      populateAdminRoleOptions();
      const currentId = adminUsersState.selected?.id;
      if (currentId) {
        const match = adminUsersState.list.find((u) => u.id === currentId);
        if (match) {
          selectAdminUser(match.id, { skipFetch: true, user: match });
        } else if (adminUsersState.list.length) {
          selectAdminUser(adminUsersState.list[0].id);
        }
      } else if (adminUsersState.list.length) {
        selectAdminUser(adminUsersState.list[0].id);
      } else {
        adminUsersState.selected = null;
        document.getElementById("adminUserDetailForm")?.classList.add("hidden");
        document.getElementById("adminUserPasswordForm")?.classList.add("hidden");
        document.getElementById("adminUserDetailPlaceholder")?.classList.remove("hidden");
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="dashboard-placeholder">${err.message || "Unable to load users"}</td></tr>`;
      toast(err.message || "Unable to load users", { type: "error" });
    } finally {
      adminUsersState.loading = false;
    }
  }

  function renderAdminUsersTable() {
    const tbody = document.getElementById("adminUsersTableBody");
    if (!tbody) return;
    const users = adminUsersState.list || [];
    if (!users.length) {
      const message = adminUsersState.loading ? "Loading users…" : "No users found.";
      tbody.innerHTML = `<tr><td colspan="6" class="dashboard-placeholder">${message}</td></tr>`;
      return;
    }
    tbody.innerHTML = users
      .map((user) => {
        const isSelected = adminUsersState.selected?.id === user.id;
        const status = user.is_active ? "Active" : "Inactive";
        const statusClass = user.is_active ? "" : "inactive";
        return `
          <tr data-user-id="${user.id}" class="${isSelected ? "active" : ""}">
            <td>${user.full_name || "—"}</td>
            <td>${user.email || "—"}</td>
            <td>${formatRoleLabel(user.role)}</td>
            <td><span class="status-pill ${statusClass}">${status}</span></td>
            <td>${formatRelativeTime(user.created_at) || "—"}</td>
            <td>${formatRelativeTime(user.last_login_at) || "—"}</td>
          </tr>`;
      })
      .join("");
  }

  function formatRoleLabel(role) {
    if (!role) return "Viewer";
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  async function selectAdminUser(userId, opts = {}) {
    if (!userId || !isCurrentUserAdmin()) return;
    const tbody = document.getElementById("adminUsersTableBody");
    if (tbody) {
      tbody.querySelectorAll("tr.active").forEach((row) => row.classList.remove("active"));
      const activeRow = tbody.querySelector(`tr[data-user-id="${userId}"]`);
      activeRow?.classList.add("active");
    }
    try {
      let user = opts.user;
      if (!opts.skipFetch) {
        const resp = await fetch(`/admin/users/${userId}`, { credentials: "include" });
        if (!resp.ok) {
          throw new Error(await readErrorMessage(resp, "Unable to load user"));
        }
        const data = await resp.json();
        user = data.user;
      }
      if (!user) return;
      adminUsersState.selected = user;
      populateAdminUserDetail(user);
    } catch (err) {
      const feedback = document.getElementById("adminUserDetailFeedback");
      if (feedback) feedback.textContent = err.message || "Unable to load user";
      toast(err.message || "Unable to load user", { type: "error" });
    }
  }

  function populateAdminUserDetail(user) {
    const placeholder = document.getElementById("adminUserDetailPlaceholder");
    const form = document.getElementById("adminUserDetailForm");
    const passForm = document.getElementById("adminUserPasswordForm");
    if (!form) return;
    placeholder?.classList.add("hidden");
    form.classList.remove("hidden");
    passForm?.classList.remove("hidden");
    document.getElementById("adminUserDetailId").value = user.id;
    document.getElementById("adminUserDetailName").value = user.full_name || "";
    document.getElementById("adminUserDetailEmail").value = user.email || "";
    populateAdminRoleOptions();
    applyAdminWorkspaceOptions();
    const roleSelect = document.getElementById("adminUserDetailRole");
    if (roleSelect && user.role) roleSelect.value = user.role;
    const workspaceSelect = document.getElementById("adminUserDetailWorkspace");
    if (workspaceSelect && user.workspace) workspaceSelect.value = user.workspace;
    const activeToggle = document.getElementById("adminUserDetailActive");
    if (activeToggle) activeToggle.checked = Boolean(user.is_active);
    document.getElementById("adminUserDetailFeedback").textContent = "";
    document.getElementById("adminUserPasswordFeedback").textContent = "";
  }

  function populateAdminRoleOptions() {
    const roles = adminUsersState.roles;
    if (!roles || !roles.length) return;
    const selects = [
      document.getElementById("adminUserDetailRole"),
      document.getElementById("adminCreateRole"),
    ];
    selects.forEach((select) => {
      if (!select) return;
      const current = select.value;
      select.innerHTML = roles
        .map((role) => `<option value="${role}">${formatRoleLabel(role)}</option>`)
        .join("");
      if (current && roles.includes(current)) {
        select.value = current;
      }
    });
  }

  async function refreshAdminWorkspaceOptions() {
    if (!isCurrentUserAdmin()) return;
    try {
      const resp = await fetch("/api/workspaces");
      if (resp.ok) {
        const data = await resp.json();
        adminUsersState.workspaces = Array.isArray(data.items) && data.items.length
          ? data.items
          : DEFAULT_WORKSPACES.slice();
      } else {
        adminUsersState.workspaces = DEFAULT_WORKSPACES.slice();
      }
    } catch {
      adminUsersState.workspaces = DEFAULT_WORKSPACES.slice();
    }
    applyAdminWorkspaceOptions();
  }

  function applyAdminWorkspaceOptions() {
    const workspaces = adminUsersState.workspaces && adminUsersState.workspaces.length
      ? adminUsersState.workspaces
      : DEFAULT_WORKSPACES.slice();
    const selects = [
      document.getElementById("adminUserDetailWorkspace"),
      document.getElementById("adminCreateWorkspace"),
    ];
    selects.forEach((select) => {
      if (!select) return;
      const current = select.value;
      select.innerHTML = workspaces
        .map((name) => `<option value="${name}">${name}</option>`)
        .join("");
      if (current && workspaces.includes(current)) {
        select.value = current;
      }
    });
  }

  async function handleAdminUserUpdate(event) {
    event.preventDefault();
    if (!isCurrentUserAdmin()) return;
    const id = Number(document.getElementById("adminUserDetailId").value);
    if (!id) return;
    const payload = {
      full_name: document.getElementById("adminUserDetailName").value.trim(),
      email: document.getElementById("adminUserDetailEmail").value.trim(),
      role: document.getElementById("adminUserDetailRole").value,
      workspace: document.getElementById("adminUserDetailWorkspace").value,
      is_active: document.getElementById("adminUserDetailActive").checked,
    };
    const feedback = document.getElementById("adminUserDetailFeedback");
    feedback.textContent = "";
    try {
      const resp = await fetch(`/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Unable to update user"));
      }
      const data = await resp.json();
      adminUsersState.selected = data.user;
      feedback.textContent = "Changes saved.";
      toast("User updated", { type: "success" });
      await refreshAdminUsersList(adminUsersState.search);
    } catch (err) {
      feedback.textContent = err.message || "Unable to update user";
      toast(err.message || "Unable to update user", { type: "error" });
    }
  }

  async function handleAdminUserPasswordChange(event) {
    event.preventDefault();
    if (!isCurrentUserAdmin()) return;
    const id = Number(document.getElementById("adminUserDetailId").value);
    if (!id) return;
    const password = document.getElementById("adminUserPassword")?.value || "";
    const confirm = document.getElementById("adminUserPasswordConfirm")?.value || "";
    const feedback = document.getElementById("adminUserPasswordFeedback");
    feedback.textContent = "";
    if (!password || password.length < 8) {
      feedback.textContent = "Password must be at least 8 characters.";
      return;
    }
    if (password !== confirm) {
      feedback.textContent = "Passwords do not match.";
      return;
    }
    try {
      const resp = await fetch(`/admin/users/${id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password, confirm_password: confirm }),
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Unable to update password"));
      }
      feedback.textContent = "Password updated.";
      const passInput = document.getElementById("adminUserPassword");
      const confirmInput = document.getElementById("adminUserPasswordConfirm");
      if (passInput) passInput.value = "";
      if (confirmInput) confirmInput.value = "";
      toast("Password updated", { type: "success" });
    } catch (err) {
      feedback.textContent = err.message || "Unable to update password";
      toast(err.message || "Unable to update password", { type: "error" });
    }
  }

  async function handleAdminCreateUser(event) {
    event.preventDefault();
    if (!isCurrentUserAdmin()) return;
    const nameInput = document.getElementById("adminCreateFullName");
    const emailInput = document.getElementById("adminCreateEmail");
    const roleSelect = document.getElementById("adminCreateRole");
    const workspaceSelect = document.getElementById("adminCreateWorkspace");
    const passwordInput = document.getElementById("adminCreatePassword");
    const autoPassword = document.getElementById("adminCreateGeneratePassword");
    const feedback = document.getElementById("adminCreateUserFeedback");
    const resultPanel = document.getElementById("adminCreatePasswordResult");
    const resultText = document.getElementById("adminCreatePasswordText");
    feedback.textContent = "";
    resultPanel?.classList.add("hidden");
    const payload = {
      full_name: nameInput?.value?.trim() || "",
      email: emailInput?.value?.trim() || "",
      role: roleSelect?.value || "viewer",
      workspace: workspaceSelect?.value || "Default",
      password: autoPassword?.checked ? null : (passwordInput?.value || ""),
      generate_password: Boolean(autoPassword?.checked),
    };
    if (!payload.full_name || !payload.email) {
      feedback.textContent = "Name and email are required.";
      return;
    }
    if (!payload.generate_password && (!payload.password || payload.password.length < 8)) {
      feedback.textContent = "Password must be at least 8 characters.";
      return;
    }
    try {
      const resp = await fetch("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Unable to create user"));
      }
      const data = await resp.json();
      toast("User created", { type: "success" });
      if (resultPanel && resultText && data.generated_password) {
        resultText.textContent = `Generated password: ${data.generated_password}`;
        resultPanel.classList.remove("hidden");
      }
      event.target.reset();
      if (passwordInput) passwordInput.value = "";
      autoPassword.checked = false;
      document.getElementById("adminCreatePasswordField")?.classList.remove("hidden");
      toggleCreateUserCard(false);
      await refreshAdminUsersList(adminUsersState.search);
      if (data.user?.id) {
        selectAdminUser(data.user.id, { skipFetch: true, user: data.user });
      }
    } catch (err) {
      feedback.textContent = err.message || "Unable to create user";
      toast(err.message || "Unable to create user", { type: "error" });
    }
  }

  function toggleCreateUserCard(show) {
    const card = document.getElementById("adminCreateUserCard");
    if (!card) return;
    if (show) {
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
      const feedback = document.getElementById("adminCreateUserFeedback");
      if (feedback) feedback.textContent = "";
      document.getElementById("adminCreatePasswordResult")?.classList.add("hidden");
    }
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
      toast(`Workspace "${name}" created`, { type: 'success' });
      openConfirmSwitch(name);
      loadWorkspaces();
    } catch (err) {
      if (feedback) feedback.textContent = err.message;
      toast(err.message || 'Failed to create workspace', { type: 'error' });
    }
  }

  // Initial boot
  renderShell();
  attachHandlers();
  fetchMeAndUpdateUI();
})();

// Toast helper
function toast(message, opts = {}) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  const type = opts.type || 'info';
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  const remove = () => {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };
  const ttl = typeof opts.ttl === 'number' ? opts.ttl : 3500;
  setTimeout(remove, ttl);
}
