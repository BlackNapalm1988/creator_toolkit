// Creator Toolkit front-end shell
// Existing sections before modular split:
// 1) Shell + navigation + workspace/theme bootstrap
// 2) Imagine inspector (chat thread + attachments)
// 3) Dashboard cards and job feeds
// 4) Create / Sora video generation + library helpers
// 5) Publish (YouTube upload + source selection)
// 6) Settings/admin (profile, workspaces, users)
// Tasks for Phase 2: move sections 3–6 into lazy-loaded modules under static/features/
// and keep this file focused on the shell, navigation, and shared UI glue.
import {
  hideLoadingState,
  formatRelativeTime,
  readErrorMessage,
  showLoadingState,
  showModuleError,
  toast,
} from "./features/common.js";

// Creator Toolkit front-end shell
(function () {
  const ROOT = document.getElementById("app");
  if (!ROOT) return;
  window.toast = toast;

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

  const featureModules = {
    "dashboard-view": {
      cacheKey: "dashboard",
      loader: () => import("./features/dashboard.js"),
      init: "initDashboard",
    },
    "create-video-view": {
      cacheKey: "sora",
      loader: () => import("./features/sora_video.js"),
      init: "initSoraPanel",
    },
    "library-view": {
      cacheKey: "sora",
      loader: () => import("./features/sora_video.js"),
      init: "initLibraryView",
    },
    "publish-view": {
      cacheKey: "publish",
      loader: () => import("./features/youtube_publish.js"),
      init: "initYoutubePanel",
    },
    "settings-profile": {
      cacheKey: "settings",
      loader: () => import("./features/settings.js"),
      init: "initSettingsPanels",
    },
    "settings-workspaces": {
      cacheKey: "settings",
      loader: () => import("./features/settings.js"),
      init: "initSettingsPanels",
    },
    "settings-advanced": {
      cacheKey: "settings",
      loader: () => import("./features/settings.js"),
      init: "initSettingsPanels",
    },
    "settings-users": {
      cacheKey: "settings",
      loader: () => import("./features/settings.js"),
      init: "initSettingsPanels",
    },
  };
  const moduleCache = {};

  async function loadFeatureForView(viewId) {
    const def = featureModules[viewId];
    const containerEl = document.getElementById("ct-workspace");
    if (!def || !containerEl) return;
    const cacheKey = def.cacheKey || viewId;
    const errBox = containerEl.querySelector('[data-feature-error]');
    if (errBox) errBox.classList.add('hidden');
    showLoadingState(containerEl);
    try {
      const mod = moduleCache[cacheKey] || await def.loader();
      moduleCache[cacheKey] = mod;
      const initFn = mod[def.init];
      if (typeof initFn !== "function") {
        throw new Error(`Missing init function: ${def.init}`);
      }
      await initFn(containerEl, { state });
      hideLoadingState(containerEl);
    } catch (err) {
      console.error(err);
      showModuleError(containerEl, "Failed to load this tool. Please try again.");
    }
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
    loadFeatureForView(viewId);
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

    // Side nav buttons + lazy-load prefetch on hover
    ROOT.querySelectorAll("#ct-nav .ct-nav-link").forEach((btn) => {
      const view = btn.getAttribute("data-view");
      const route = view ? featureModules[view] : null;
      if (route) {
        btn.addEventListener("mouseover", () => {
          const cacheKey = route.cacheKey || view;
          if (!moduleCache[cacheKey]) {
            route.loader().then((mod) => (moduleCache[cacheKey] = mod)).catch(() => {});
          }
        });
      }
      btn.addEventListener("click", () => {
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

    // Notification and settings shortcuts
    const verificationOverlay = document.getElementById("verificationOverlay");
    const verifyOpenProfile = document.getElementById("verifyOpenProfile");
    const goToSettings = () => {
      verificationOverlay?.classList.add("hidden");
      window.location.href = "/settings";
    };
    verifyOpenProfile?.addEventListener("click", goToSettings);
    const openVerBtn = document.getElementById("openVerificationButton");
    openVerBtn?.addEventListener("click", () => {
      document.getElementById("verificationOverlay")?.classList.remove("hidden");
    });
    const openPwBtn = document.getElementById("openPasswordResetButton");
    openPwBtn?.addEventListener("click", goToSettings);

    // Create sub-module tabs
    document.querySelectorAll(".ct-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        if (!view) return;
        applyActiveView(view, { updateHistory: false });
        document.querySelectorAll(".ct-tab").forEach((t) => {
          t.classList.toggle("active", t.getAttribute("data-view") === view);
        });
      });
    });

    // Create hub cards (clickable entire card)
    document.querySelectorAll(".create-card[data-view]").forEach((card) => {
      const activate = () => {
        const view = card.getAttribute("data-view");
        if (!view) return;
        applyActiveView(view, { updateHistory: false });
        document.querySelectorAll(".ct-tab").forEach((t) => {
          t.classList.toggle("active", t.getAttribute("data-view") === view);
        });
      };
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });

    // Login modal using the existing overlay in templates/dashboard.html
    const openBtn = document.getElementById("openLoginButton");
    const overlay = document.getElementById("authOverlay");
    const loginForm = document.getElementById("overlayLoginForm");
    const loginEmail = document.getElementById("overlayLoginEmail");
    const loginPassword = document.getElementById("overlayLoginPassword");
    const authFeedback = document.getElementById("authFeedback");
    if (!window.__ctAuthHandlersBound) {
      openBtn?.addEventListener("click", () => {
        if (!overlay) return;
        overlay.classList.remove("hidden");
        overlay.style.display = "flex";
      });
      loginForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (authFeedback) authFeedback.textContent = "";
        const email = (loginEmail?.value || "").trim();
        const password = loginPassword?.value || "";
        if (!email || !password) {
          if (authFeedback) authFeedback.textContent = "Email and password are required";
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
          toast("Logged in", { type: "success" });
          if (loginEmail) loginEmail.value = "";
          if (loginPassword) loginPassword.value = "";
          await fetchMeAndUpdateUI();
        } catch (err) {
          if (authFeedback) authFeedback.textContent = err.message || "Login failed";
          toast(err.message || "Login failed", { type: "error" });
        }
      });
      document.getElementById("logoutButton")?.addEventListener("click", async () => {
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
        try {
          await fetchMeAndUpdateUI();
        } catch {}
        toast("Logged out", { type: "info" });
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
            ov.style.display = "flex";
          }
          return;
        }
        if (action === "open-workspace-create") {
          document.getElementById("createWorkspaceModal")?.classList.remove("hidden");
          setTimeout(
            () =>
              document
                .querySelector('#createWorkspaceModal [data-action="create-workspace-cancel"]')
                ?.focus(),
            0,
          );
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
            if (fb) fb.textContent = "Name is required";
            return;
          }
          if (!/^[A-Za-z0-9_\\-\\s]+$/.test(name) || name.toLowerCase() === "con") {
            if (fb) fb.textContent = "Use letters, numbers, dash, underscore, or space";
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
          try {
            localStorage.setItem("activeWorkspace", name);
          } catch {}
          state.workspace = name;
          try {
            resetImagineState();
            renderImaginePanel();
          } catch {}
          state.pending = "";
          setWorkspaceTitle(name);
          try {
            setWorkspaceMeta(name, { lastOpened: Date.now() });
          } catch {}
          document.getElementById("confirmSwitchModal")?.classList.add("hidden");
          const qs = `?ws=${name}`;
          window.location.href = "/settings/project" + qs;
        }
      });
      window.__ctActionHandlerBound = true;
    }

    mountImagineInspector();
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
    if (me) {
      try { await loadFeatureForView(state.activeView); } catch {}
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
