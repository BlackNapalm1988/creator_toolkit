// Creator Toolkit front-end shell
(function () {
  const ROOT = document.getElementById("app");
  if (!ROOT) return;

  const initialActive =
    ROOT.getAttribute("data-active-view") || "dashboard-view";

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
        view: "create-view",
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
              <button id="collapseSidebar" class="ct-sidebar__toggle" type="button" title="Toggle sidebar">&#x1F354;</button>
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
    const shellRoot = ROOT.querySelector("#ct-shell-root");
    if (state.collapsed) shellRoot?.classList.add("ct-shell--sidebar-collapsed");
    setWorkspaceTitle(state.workspace);
  }

  function applyActiveView(viewId, opts = {}) {
    state.activeView = viewId;
    // Update nav active state
    ROOT.querySelectorAll("#ct-nav .ct-nav-link").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewId);
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
      const navItem = state.nav.find((n) => n.view === viewId);
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
      }
      if (action === "create-workspace-cancel") {
        document.getElementById("createWorkspaceModal")?.classList.add("hidden");
        const fb = document.getElementById("createWorkspaceFeedback");
        if (fb) fb.textContent = "";
      }
      if (action === "create-workspace-submit") {
        const input = document.getElementById("newWorkspaceName");
        const name = (input?.value || "").trim();
        if (name) createWorkspace(name);
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
        state.workspace = name;
        state.pending = "";
        // Update title immediately before navigating
        setWorkspaceTitle(name);
        document.getElementById("confirmSwitchModal")?.classList.add("hidden");
        // Slight delay to ensure title visually updates only after confirm
        setTimeout(() => {
          window.location.href = "/settings/project";
        }, 50);
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
      btn.setAttribute("data-action", "select-workspace");
      btn.setAttribute("data-name", name);
      btn.textContent = name;
      menu.appendChild(btn);
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

  function setWorkspaceTitle(name) {
    const el = document.getElementById("workspaceTitleLabel");
    const value = name ?? localStorage.getItem("activeWorkspace") || "Default";
    if (el) el.textContent = value;
  }

  function openConfirmSwitch(name) {
    state.pending = name;
    document.getElementById("confirmSwitchModal")?.classList.remove("hidden");
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
