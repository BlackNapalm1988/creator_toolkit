// =========================
// Application Shell Layout
// =========================

const VIEW_PATHS = {
  "dashboard-view": "/dashboard",
  "imagine-view": "/imagine",
  "create-view": "/create",
  "publish-view": "/publish",
  "system-view": "/system",
  library: "#library",
  "library-scenes": "#library/scenes",
  "library-video": "#library/video",
  "library-audio": "#library/audio",
  "library-other": "#library/other",
  jobs: "#jobs",
  "jobs-active": "#jobs/active",
  "jobs-history": "#jobs/history",
};

const NAV_SECTIONS = [
  {
    label: "Imagine",
    id: "imagine",
    navId: "navImagine",
    view: "imagine-view",
    roles: "admin owner editor",
  },
  {
    label: "Create",
    id: "create",
    navId: "navCreate",
    view: "create-view",
    roles: "admin owner editor",
    children: [
      { label: "New Project", id: "create-new" },
      { label: "Image from Text", id: "create-image-text" },
      { label: "Scene from Text", id: "create-scene-text" },
      { label: "Video from Text", id: "create-video-text" },
    ],
  },
  {
    label: "Library",
    id: "library",
    view: "library",
    children: [
      { label: "Scenes", id: "library-scenes" },
      { label: "Video", id: "library-video" },
      { label: "Audio", id: "library-audio" },
      { label: "Other", id: "library-other" },
    ],
  },
  {
    label: "Publish",
    id: "publish",
    navId: "navPublish",
    view: "publish-view",
    roles: "admin owner",
    children: [
      { label: "YouTube", id: "publish-youtube" },
      { label: "Facebook", id: "publish-facebook" },
      { label: "Instagram", id: "publish-instagram" },
      { label: "TikTok", id: "publish-tiktok" },
    ],
  },
  {
    label: "Jobs",
    id: "jobs",
    view: "jobs",
    children: [
      { label: "Active Jobs", id: "jobs-active" },
      { label: "History", id: "jobs-history" },
    ],
  },
];

const INSPECTOR_CARDS = [
  {
    title: "Music created and added to assets",
    description:
      "Latest audio generations appear in your Library. Drag them into new edits or share with collaborators.",
  },
  {
    title: "Scene created and added to assets",
    description:
      "Keep iterating on your scenes. Refresh prompts, remix scripts, and stage shots before packaging.",
  },
  {
    title: "What would you like to do?",
    description: "Prompt Imagine with goals or paste scripts to generate beat boards, voiceover, and music cues.",
  },
];

const LEGACY_VIEWS = new Set([
  "dashboard-view",
  "imagine-view",
  "create-view",
  "publish-view",
  "system-view",
]);

let shellRoot = null;
let mainContentEl = null;
let navButtons = [];
let inspectorActionButton = null;
let legacyWorkspace = null;
let dynamicWorkspace = null;
let initialActiveView = "dashboard-view";
const SHELL_MAX_BOOTSTRAP_ATTEMPTS = 10;
let shellBootstrapAttempts = 0;

function renderShell(activeViewOverride) {
  console.log("[ui-shell] renderShell invoked");

  const root = document.getElementById("app");
  if (!root) {
    console.warn("[ui-shell] #app root not found; aborting shell mount");
    return false;
  }

  console.log("[ui-shell] root found");

  const legacyContent = document.getElementById("legacyContent");
  const activeView = activeViewOverride || root.dataset.activeView || "dashboard-view";

  const shell = document.createElement("div");
  shell.id = "ct-shell";
  shell.className = "ct-shell ct-shell--sidebar-open ct-shell--inspector-open";
  shell.innerHTML = `
    <aside id="ct-sidebar" class="ct-sidebar ct-sidebar--open">
      <div class="ct-sidebar__inner"></div>
    </aside>
    <main id="ct-main" class="ct-main" data-active-view="${activeView}"></main>
    <aside id="ct-inspector" class="ct-inspector ct-inspector--open">
      <div class="ct-inspector__inner"></div>
    </aside>
  `;

  root.innerHTML = "";
  root.appendChild(shell);

  console.log("[ui-shell] shell container injected");

  renderSidebar(activeView);
  renderMainWorkspace(legacyContent, activeView);
  renderInspector();
  bindShellControls();
  refreshShellRefs();
  bindNavigationHandlers();
  bindInspectorActions();

  return true;
}

function renderSidebarSection(section, activeView) {
  const sectionEl = document.createElement("section");
  sectionEl.className = "ct-nav-section";

  const sectionView = section.view || section.id;
  const hasChildren = Array.isArray(section.children) && section.children.length > 0;
  const childActive = hasChildren
    ? section.children.some(child => (child.view || child.id) === activeView)
    : false;

  if (sectionView) {
    const link = document.createElement("a");
    link.className = "ct-nav-link ct-nav-item nav-item";
    link.href = VIEW_PATHS[sectionView] || "#";
    link.dataset.view = sectionView;
    if (section.roles) {
      link.dataset.roles = section.roles;
    }
    if (section.navId) {
      link.id = section.navId;
    }

    if (sectionView === activeView || childActive) {
      link.classList.add("active");
    }

    const iconText = section.label.charAt(0).toUpperCase();
    link.innerHTML = `
      <span class="ct-nav-link__icon" aria-hidden="true">${iconText}</span>
      <span class="ct-nav-link__label">${section.label}</span>
    `;
    sectionEl.appendChild(link);
  } else {
    const heading = document.createElement("h3");
    heading.className = "ct-nav-heading";
    heading.textContent = section.label;
    sectionEl.appendChild(heading);
  }

  if (hasChildren) {
    const list = document.createElement("ul");
    list.className = "ct-nav-children";

    section.children.forEach(child => {
      const childView = child.view || child.id;
      if (!childView) {
        return;
      }

      const item = document.createElement("li");
      item.className = "ct-nav-child";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "ct-nav-item ct-nav-child__button";
      button.dataset.view = childView;
      if (sectionView) {
        button.dataset.parent = sectionView;
      }
      if (child.roles) {
        button.dataset.roles = child.roles;
      } else if (section.roles) {
        button.dataset.roles = section.roles;
      }
      if (childView === activeView) {
        button.classList.add("active");
      }
      button.textContent = child.label;
      item.appendChild(button);
      list.appendChild(item);
    });

    sectionEl.appendChild(list);
  }

  return sectionEl;
}

function renderSidebar(activeView) {
  const sidebar = document.getElementById("ct-sidebar");
  if (!sidebar) {
    console.warn("[ui-shell] sidebar mount point missing");
    return;
  }

  console.log("[ui-shell] rendering sidebar");

  const inner = document.createElement("div");
  inner.className = "ct-sidebar__inner";
  inner.innerHTML = `
    <div class="ct-sidebar__header">
      <button id="ct-sidebar-toggle" class="ct-sidebar__toggle" aria-label="Collapse navigation" aria-expanded="true">
        <span aria-hidden="true">‹</span>
      </button>
      <span class="ct-sidebar__title">Workspace</span>
    </div>
    <nav id="ct-sidebar-nav" class="ct-sidebar__nav"></nav>
  `;

  sidebar.innerHTML = "";
  sidebar.appendChild(inner);

  const navEl = inner.querySelector("#ct-sidebar-nav");
  if (!navEl) return;

  NAV_SECTIONS.forEach(section => {
    const sectionEl = renderSidebarSection(section, activeView);
    if (sectionEl) {
      navEl.appendChild(sectionEl);
    }
  });

  console.log("[ui-shell] sidebar rendered");
}

function renderMainWorkspace(legacyContent, activeView) {
  const main = document.getElementById("ct-main");
  if (!main) {
    console.warn("[ui-shell] main workspace mount point missing");
    return;
  }

  console.log("[ui-shell] rendering main workspace");

  let workspace = document.getElementById("ct-main-workspace");
  if (!workspace) {
    workspace = document.createElement("div");
    workspace.id = "ct-main-workspace";
    workspace.className = "ct-main-workspace";
    main.appendChild(workspace);
  }

  if (legacyContent) {
    legacyContent.classList.remove("legacy-content");
    legacyContent.id = "ct-legacy-content";
    legacyContent.classList.add("ct-legacy-content");
    if (!workspace.contains(legacyContent)) {
      workspace.appendChild(legacyContent);
    }
  }

  let dynamic = document.getElementById("ct-main-dynamic");
  if (!dynamic) {
    dynamic = document.createElement("div");
    dynamic.id = "ct-main-dynamic";
    dynamic.className = "ct-main-dynamic hidden";
    workspace.appendChild(dynamic);
  }

  legacyWorkspace = document.getElementById("ct-legacy-content");
  dynamicWorkspace = dynamic;

  // Future steps (Library, Storyboard, Video Editor) will mount new views inside this workspace.
  main.dataset.activeView = activeView;
  console.log("[ui-shell] main workspace rendered");
}

function shouldUseLegacyWorkspace(viewId) {
  return LEGACY_VIEWS.has(viewId);
}

function renderWorkspace(viewId) {
  if (!mainContentEl) return;

  const workspace = document.getElementById("ct-main-workspace");
  if (!workspace) return;

  const normalized = (viewId || "").toLowerCase();
  const useLegacy = shouldUseLegacyWorkspace(normalized);

  const dynamic = dynamicWorkspace || document.getElementById("ct-main-dynamic");
  const legacy = legacyWorkspace || document.getElementById("ct-legacy-content");

  if (legacy) {
    legacy.classList.toggle("hidden", !useLegacy);
  }

  if (!dynamic) {
    return;
  }

  dynamic.innerHTML = "";
  dynamic.classList.toggle("hidden", useLegacy);

  if (useLegacy) {
    console.log(`[ui-shell] workspace using legacy content for ${normalized || "default"}`);
    return;
  }

  console.log(`[ui-shell] rendering workspace for ${normalized}`);

  switch (normalized) {
    case "library":
    case "library-scenes":
    case "library-video":
    case "library-audio":
    case "library-other":
      renderLibraryWorkspace(dynamic, normalized);
      break;
    case "jobs":
    case "jobs-active":
    case "jobs-history":
      renderJobsWorkspace(dynamic, normalized);
      break;
    default:
      renderPlaceholderWorkspace(dynamic, normalized);
      break;
  }
}

function renderLibraryWorkspace(root, viewId) {
  if (!root) return;

  const copy = {
    library: {
      title: "Library",
      body: "Coming soon — manage your generated assets from a single dashboard.",
      empty: "No assets yet — generate content in Imagine to populate your Library.",
    },
    "library-scenes": {
      title: "Library · Scenes",
      body: "Review and organize storyboard scenes created across your projects.",
      empty: "No scenes yet — generate new scenes to see them here.",
    },
    "library-video": {
      title: "Library · Video",
      body: "Final and in-progress video renders will appear in this list.",
      empty: "No videos yet — export from Imagine or upload your own assets.",
    },
    "library-audio": {
      title: "Library · Audio",
      body: "Voiceover, music, and SFX assets will live here for quick reuse.",
      empty: "No audio yet — generate music or import stems to build your collection.",
    },
    "library-other": {
      title: "Library · Other",
      body: "Additional creative assets (images, docs) will surface here soon.",
      empty: "No miscellaneous assets yet — drop uploads here to keep them handy.",
    },
  };

  const { title, body, empty } = copy[viewId] || copy.library;
  root.innerHTML = `
    <section class="ct-workspace-section">
      <header class="ct-workspace-header">
        <h2>${title}</h2>
        <p>${body}</p>
      </header>
      <div class="ct-workspace-body">
        <p class="ct-empty">${empty}</p>
      </div>
    </section>
  `;
}

function renderJobsWorkspace(root, viewId) {
  if (!root) return;

  const copy = {
    jobs: {
      title: "Jobs",
      body: "Monitor active generation and packaging work in one place.",
      empty: "No jobs to show — kick off an Imagine request to populate this feed.",
    },
    "jobs-active": {
      title: "Jobs · Active",
      body: "Track progress for in-flight Imagine, QA, and packaging jobs.",
      empty: "No active jobs — start a new generation to see it here.",
    },
    "jobs-history": {
      title: "Jobs · History",
      body: "Review recently completed jobs and revisit their outputs.",
      empty: "No job history yet — completed work will be listed here.",
    },
  };

  const { title, body, empty } = copy[viewId] || copy.jobs;
  root.innerHTML = `
    <section class="ct-workspace-section">
      <header class="ct-workspace-header">
        <h2>${title}</h2>
        <p>${body}</p>
      </header>
      <div class="ct-workspace-body">
        <p class="ct-empty">${empty}</p>
      </div>
    </section>
  `;
}

function renderPlaceholderWorkspace(root, viewId) {
  if (!root) return;

  const label = viewId.replace(/-/g, " ").replace(/\b\w/g, char => char.toUpperCase());
  root.innerHTML = `
    <section class="ct-workspace-section">
      <header class="ct-workspace-header">
        <h2>${label}</h2>
        <p>Placeholder view — content coming soon.</p>
      </header>
      <div class="ct-workspace-body">
        <p class="ct-empty">Nothing to show yet.</p>
      </div>
    </section>
  `;
}

function renderInspector() {
  const inspector = document.getElementById("ct-inspector");
  if (!inspector) {
    console.warn("[ui-shell] inspector mount point missing");
    return;
  }

  console.log("[ui-shell] rendering inspector");

  const inner = inspector.querySelector(".ct-inspector__inner");
  if (!inner) return;

  inner.innerHTML = `
    <button id="ct-inspector-toggle" class="ct-inspector__toggle" aria-label="Collapse Imagine panel" aria-expanded="true">
      <span aria-hidden="true">›</span>
    </button>
    <header class="ct-inspector__header">
      <h2>IMAGINE</h2>
      <p class="ct-inspector__subtitle">Prompt tools & creative memory</p>
    </header>
    <div id="ct-inspector-body" class="ct-inspector__body"></div>
    <div class="ct-inspector__footer">
      <button id="ct-inspector-action" class="ghost-btn full">Create a new video</button>
    </div>
  `;

  const body = inner.querySelector("#ct-inspector-body");
  if (!body) return;

  // Placeholder Imagine activity cards; Step 2+ will replace these with live data.
  INSPECTOR_CARDS.forEach(card => {
    const cardEl = document.createElement("article");
    cardEl.className = "ct-inspector__card";
    const title = document.createElement("h3");
    title.textContent = card.title;
    const description = document.createElement("p");
    description.textContent = card.description;
    cardEl.appendChild(title);
    cardEl.appendChild(description);
    body.appendChild(cardEl);
  });

  console.log("[ui-shell] inspector rendered");
}

function bindShellControls() {
  const shell = document.getElementById("ct-shell");
  const sidebar = document.getElementById("ct-sidebar");
  const inspector = document.getElementById("ct-inspector");
  if (!shell || !sidebar || !inspector) {
    console.warn("[ui-shell] shell controls missing required elements");
    return;
  }

  const sidebarToggle = document.getElementById("ct-sidebar-toggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      const isCollapsed = sidebar.classList.toggle("ct-sidebar--collapsed");
      sidebar.classList.toggle("ct-sidebar--open", !isCollapsed);
      shell.classList.toggle("ct-shell--sidebar-collapsed", isCollapsed);
      sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
      sidebarToggle.innerHTML = `<span aria-hidden="true">${isCollapsed ? "›" : "‹"}</span>`;
    });
  }

  const inspectorToggle = document.getElementById("ct-inspector-toggle");
  if (inspectorToggle) {
    inspectorToggle.addEventListener("click", () => {
      const isClosed = inspector.classList.toggle("ct-inspector--closed");
      inspector.classList.toggle("ct-inspector--open", !isClosed);
      shell.classList.toggle("ct-shell--inspector-closed", isClosed);
      inspectorToggle.setAttribute("aria-expanded", String(!isClosed));
      inspectorToggle.innerHTML = `<span aria-hidden="true">${isClosed ? "‹" : "›"}</span>`;
    });
  }

  console.log("[ui-shell] shell controls bound");
}

function refreshShellRefs() {
  shellRoot = document.getElementById("ct-shell");
  mainContentEl = document.getElementById("ct-main");
  legacyWorkspace = document.getElementById("ct-legacy-content");
  dynamicWorkspace = document.getElementById("ct-main-dynamic");
  navButtons = Array.from(document.querySelectorAll(".ct-nav-item[data-view]"));
  inspectorActionButton = document.getElementById("ct-inspector-action");
}

function handleNavSelection(btn, event) {
  if (!btn || btn.classList.contains("hidden")) return;

  const target = btn.dataset.view;
  if (!target) return;

  if (btn.dataset.locked === "verify") {
    if (event) {
      event.preventDefault();
    }
    showVerificationOverlay();
    if (verificationBanner) {
      verificationBanner.classList.remove("hidden");
    }
    return;
  }

  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  const href = btn.tagName === "A" ? btn.getAttribute("href") : btn.dataset.path || VIEW_PATHS[target];
  changeView(target, { path: href });
  if (target === "dashboard-view") {
    loadDashboardData(true, { silent: true });
  }
}

function bindNavigationHandlers() {
  if (!document.body || document.body.dataset.shellNavBound === "1") {
    return;
  }

  document.body.dataset.shellNavBound = "1";
  document.body.addEventListener("click", event => {
    const btn = event.target.closest(".ct-nav-item[data-view]");
    if (!btn) {
      return;
    }

    handleNavSelection(btn, event);
  });
}

function bindInspectorActions() {
  if (!inspectorActionButton || inspectorActionButton.dataset.shellBound === "1") {
    return;
  }

  inspectorActionButton.dataset.shellBound = "1";
  inspectorActionButton.addEventListener("click", () => {
    changeView("create-view", { path: VIEW_PATHS["create-view"] });
  });
}

function initializeShell() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeShell, { once: true });
    return;
  }

  console.log("[ui-shell] initializing shell");

  const root = document.getElementById("app");
  initialActiveView = (root && root.dataset.active_view) || (root && root.dataset.activeView) || initialActiveView;

  const mounted = renderShell(initialActiveView);
  if (!mounted) {
    shellBootstrapAttempts += 1;
    if (shellBootstrapAttempts >= SHELL_MAX_BOOTSTRAP_ATTEMPTS) {
      console.error(
        `[ui-shell] shell mount failed after ${shellBootstrapAttempts} attempts; giving up`
      );
      return;
    }

    console.warn(
      `[ui-shell] renderShell failed (attempt ${shellBootstrapAttempts}); retrying on next frame`
    );
    requestAnimationFrame(initializeShell);
    return;
  }

  shellBootstrapAttempts = 0;

  const mountedView = (mainContentEl && mainContentEl.dataset.activeView) || initialActiveView;
  initialActiveView = mountedView;
  changeView(mountedView, {
    path: window.location.pathname,
    replace: true,
  });

  if (typeof applyUserState === "function") {
    try {
      applyUserState();
    } catch (err) {
      console.warn("[ui-shell] applyUserState failed during shell init", err);
    }
  }

  console.log("[ui-shell] shell initialized");
}

initializeShell();

// =========================
// Authentication / UI state
// =========================
const STORAGE_TOKEN_KEY = "jwtToken";
const authState = {
  token: null,
  user: null,
};

const brandMark = document.getElementById("brandMark");
const brandMarkDefault = brandMark
  ? (brandMark.dataset.defaultIcon || brandMark.textContent || "CT").trim()
  : "CT";
let activeBrandBadge = brandMarkDefault;
const brandingPreview = document.getElementById("brandingPreview");
const brandingConfigSection = document.getElementById("brandingConfigSection");
const brandingForm = document.getElementById("brandingForm");
const brandingBadgeInput = document.getElementById("brandingBadge");
const brandingFeedback = document.getElementById("brandingFeedback");
const authOverlay = document.getElementById("authOverlay");
const authTabs = authOverlay ? Array.from(authOverlay.querySelectorAll(".modal-tab")) : [];
const overlayLoginForm = document.getElementById("overlayLoginForm");
const overlayRegisterForm = document.getElementById("overlayRegisterForm");
const authFeedback = document.getElementById("authFeedback");
const authActions = document.getElementById("authActions");
const openLoginButton = document.getElementById("openLoginButton");
const openAuthFromPublishButton = document.getElementById("openAuthFromPublish");

const loginEmailInput = document.getElementById("overlayLoginEmail");
const loginPasswordInput = document.getElementById("overlayLoginPassword");
const registerNameInput = document.getElementById("overlayRegisterName");
const registerEmailInput = document.getElementById("overlayRegisterEmail");
const registerPasswordInput = document.getElementById("overlayRegisterPassword");

const verificationOverlay = document.getElementById("verificationOverlay");
const verifyForm = document.getElementById("verifyForm");
const verifyCodeInput = document.getElementById("verifyCode");
const verifyFeedback = document.getElementById("verifyFeedback");
const resendCodeButton = document.getElementById("resendCodeButton");
const verifyOpenProfileButton = document.getElementById("verifyOpenProfile");
const verifyLogoutButton = document.getElementById("verifyLogout");

const profileModal = document.getElementById("profileModal");
const closeProfileModalBtn = document.getElementById("closeProfileModal");
const profileForm = document.getElementById("profileForm");
const profileNameInput = document.getElementById("profileName");
const profileEmailInput = document.getElementById("profileEmail");
const profileFormFeedback = document.getElementById("profileFormFeedback");
const profileVerificationStatus = document.getElementById("profileVerificationStatus");
const profileRoleLabel = document.getElementById("profileRole");
const rolePermissionsList = document.getElementById("rolePermissionsList");
const passwordResetBanner = document.getElementById("passwordResetBanner");
const openPasswordResetButton = document.getElementById("openPasswordResetButton");

const passwordForm = document.getElementById("passwordForm");
const currentPasswordInput = document.getElementById("currentPassword");
const newPasswordInput = document.getElementById("newPassword");
const passwordFormFeedback = document.getElementById("passwordFormFeedback");

const smtpConfigSection = document.getElementById("smtpConfigSection");
const smtpConfigForm = document.getElementById("smtpConfigForm");
const smtpConfigFeedback = document.getElementById("smtpConfigFeedback");
const smtpHostInput = document.getElementById("smtpHost");
const smtpPortInput = document.getElementById("smtpPort");
const smtpUsernameInput = document.getElementById("smtpUsername");
const smtpPasswordInput = document.getElementById("smtpPassword");
const smtpFromAddressInput = document.getElementById("smtpFromAddress");
const smtpUseTlsInput = document.getElementById("smtpUseTls");
const smtpTestForm = document.getElementById("smtpTestForm");
const smtpTestRecipientInput = document.getElementById("smtpTestRecipient");
const smtpTestFeedback = document.getElementById("smtpTestFeedback");

const apiKeyForm = document.getElementById("apiKeyForm");
const apiKeyProviderInput = document.getElementById("apiKeyProvider");
const apiKeySecretInput = document.getElementById("apiKeySecret");
const apiKeysList = document.getElementById("apiKeysList");
const apiKeysFeedback = document.getElementById("apiKeysFeedback");

const profileButton = document.getElementById("profileButton");
const logoutButton = document.getElementById("logoutButton");
const userActions = document.getElementById("userActions");
const userGreeting = document.getElementById("userGreeting");
const docsLink = document.getElementById("docsLink");
const verificationBanner = document.getElementById("verificationBanner");
const openVerificationButton = document.getElementById("openVerificationButton");
const openSystemProfileButton = document.getElementById("openSystemProfileButton");

const dashboardInfo = document.getElementById("dashboardInfo");
const dashboardError = document.getElementById("dashboardError");
const dashboardProfileList = document.getElementById("dashboardProfileList");
const dashboardProviders = document.getElementById("dashboardProviders");
const recentJobsBody = document.getElementById("recentJobsBody");
const recentAssetsList = document.getElementById("recentAssetsList");
const activeJobsList = document.getElementById("activeJobsList");
const refreshJobsButton = document.getElementById("refreshJobsButton");
const dashboardRoleBadge = document.getElementById("dashboardRoleBadge");

const VERIFY_NAV_HINT = "Verify your email to access this area.";
const viewSections = Array.from(document.querySelectorAll(".view"));

const generateControls = [
  document.getElementById("imagineSendBtn"),
  document.getElementById("musicGenerateBtn"),
  document.getElementById("videoGenerateBtn"),
  document.getElementById("masterBuildBtn"),
].filter(Boolean);

const publishControls = [
  document.getElementById("ytUploadBtn"),
].filter(Boolean);

const ROLE_CAPABILITIES = {
  admin: { generate: true, publish: true, manageKeys: true, admin: true },
  owner: { generate: true, publish: true, manageKeys: true, admin: false },
  editor: { generate: true, publish: false, manageKeys: false, admin: false },
  viewer: { generate: false, publish: false, manageKeys: false, admin: false },
};

const ROLE_DESCRIPTIONS = {
  admin: [
    "Configure system SMTP settings.",
    "Publish content and manage all API keys.",
    "Manage roles for other users.",
  ],
  owner: [
    "Create and publish content for your workspace.",
    "Manage your own API keys and credentials.",
  ],
  editor: [
    "Create and QA content.",
    "Package projects for review (no publishing).",
  ],
  viewer: [
    "View dashboards and assets in read-only mode.",
  ],
};

function getRoleCapabilities(role) {
  const key = (role || "viewer").toLowerCase();
  return ROLE_CAPABILITIES[key] || ROLE_CAPABILITIES.viewer;
}

let lastDashboardUserId = null;
let dashboardLoading = false;
let dashboardPollHandle = null;
let activeViewId = "dashboard-view";

function applyBrandingBadge(rawValue) {
  const text = (rawValue || "").trim() || brandMarkDefault;
  activeBrandBadge = text;
  if (brandMark) {
    brandMark.textContent = text;
  }
  if (brandingPreview) {
    brandingPreview.textContent = text;
  }
}

function setDashboardMessage(message) {
  if (!dashboardInfo) return;
  dashboardInfo.textContent = message || "";
  dashboardInfo.classList.toggle("hidden", !message);
}

function clearDashboardError() {
  if (!dashboardError) return;
  dashboardError.textContent = "";
  dashboardError.classList.add("hidden");
}

function showDashboardError(message) {
  if (!dashboardError) return;
  dashboardError.textContent = message || "Unable to load dashboard data.";
  dashboardError.classList.remove("hidden");
}

function resetDashboardWidgetsForLoggedOut() {
  if (dashboardProfileList) {
    dashboardProfileList.innerHTML = "";
    const item = document.createElement("li");
    item.className = "dashboard-placeholder";
    item.textContent = "Sign in to view your profile.";
    dashboardProfileList.appendChild(item);
  }
  if (dashboardProviders) {
    dashboardProviders.innerHTML = "";
    const msg = document.createElement("p");
    msg.className = "dashboard-placeholder";
    msg.textContent = "Sign in to view connected services.";
    dashboardProviders.appendChild(msg);
  }
  if (recentJobsBody) {
    recentJobsBody.innerHTML = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "dashboard-placeholder";
    cell.textContent = "Sign in to view recent jobs.";
    row.appendChild(cell);
    recentJobsBody.appendChild(row);
  }
  if (recentAssetsList) {
    recentAssetsList.innerHTML = "";
    const assetItem = document.createElement("li");
    assetItem.className = "dashboard-placeholder";
    assetItem.textContent = "Sign in to view recent assets.";
    recentAssetsList.appendChild(assetItem);
  }
  if (activeJobsList) {
    activeJobsList.innerHTML = "";
    const p = document.createElement("p");
    p.className = "dashboard-placeholder";
    p.textContent = "Sign in to view job activity.";
    activeJobsList.appendChild(p);
  }
  if (dashboardRoleBadge) {
    dashboardRoleBadge.textContent = "Viewer";
  }
  setDashboardMessage("Sign in to view your account overview.");
  clearDashboardError();
  dashboardLoading = false;
  lastDashboardUserId = null;
  if (passwordResetBanner) passwordResetBanner.classList.add("hidden");
}

function formatTimestamp(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function formatProgress(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${Math.round(num)}%`;
}

function renderDashboardData(payload) {
  if (!payload) return;

  if (payload.branding) {
    applyBrandingBadge(payload.branding.badge_text);
  }

  const profile = payload.user || {};
  const role = (profile.role || "viewer").toString();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  if (dashboardRoleBadge) {
    dashboardRoleBadge.textContent = roleLabel;
  }
  if (dashboardProfileList) {
    dashboardProfileList.innerHTML = "";
    const entries = [
      { label: "Display Name", value: profile.display_name || "—" },
      { label: "User ID", value: profile.id !== undefined && profile.id !== null ? profile.id : "—" },
      { label: "Role", value: roleLabel },
      { label: "Email Verified", value: profile.email_verified ? "Yes" : "No" },
      { label: "Password Change Required", value: profile.must_change_password ? "Yes" : "No" },
    ];
    entries.forEach(({ label, value }) => {
      const li = document.createElement("li");
      const labelSpan = document.createElement("span");
      labelSpan.className = "label";
      labelSpan.textContent = `${label}:`;
      const valueSpan = document.createElement("span");
      valueSpan.textContent = value;
      li.appendChild(labelSpan);
      li.appendChild(valueSpan);
      dashboardProfileList.appendChild(li);
    });
  }

  if (dashboardProviders) {
    dashboardProviders.innerHTML = "";
    const providerMap = [
      { key: "openai", label: "OpenAI" },
      { key: "elevenlabs", label: "ElevenLabs" },
      { key: "youtube", label: "YouTube" },
    ];
    providerMap.forEach(({ key, label }) => {
      const status = payload.providers && payload.providers[key] === "connected" ? "connected" : "missing";
      const row = document.createElement("div");
      row.className = "status-row";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = label;
      const badge = document.createElement("span");
      badge.className = `status-pill ${status}`;
      badge.textContent = status === "connected" ? "Connected" : "Missing";
      row.appendChild(nameSpan);
      row.appendChild(badge);
      dashboardProviders.appendChild(row);
    });
  }

  if (activeJobsList) {
    activeJobsList.innerHTML = "";
    const jobs = Array.isArray(payload.active_jobs) ? payload.active_jobs : [];
    if (!jobs.length) {
      const empty = document.createElement("p");
      empty.className = "dashboard-placeholder";
      empty.textContent = "No active jobs.";
      activeJobsList.appendChild(empty);
    } else {
      jobs.forEach(job => {
        const item = document.createElement("div");
        item.className = "job-item";
        const status = (job.status || "").toString().toLowerCase();
        if (status === "failed") item.classList.add("failed");

        const header = document.createElement("div");
        header.className = "job-header";
        const title = document.createElement("div");
        title.textContent = `${job.type || "Job"} · ${job.id || "—"}`;
        const statusBadge = document.createElement("span");
        statusBadge.className = `job-status ${status}`;
        statusBadge.textContent = status || "unknown";
        header.appendChild(title);
        header.appendChild(statusBadge);
        item.appendChild(header);

        const meta = document.createElement("div");
        meta.className = "job-meta";
        const stageText = job.stage ? `Stage: ${job.stage}` : "Stage: —";
        const progressText = `Progress: ${formatProgress(job.progress)}`;
        const updatedText = `Updated: ${formatTimestamp(job.updated_at)}`;
        [stageText, progressText, updatedText].forEach(text => {
          const span = document.createElement("span");
          span.textContent = text;
          meta.appendChild(span);
        });
        item.appendChild(meta);

        const progressWrap = document.createElement("div");
        progressWrap.className = "progress-wrap";
        const progressFill = document.createElement("div");
        progressFill.className = "progress-bar";
        const pct = job.progress === null || job.progress === undefined ? 0 : Math.max(0, Math.min(100, Number(job.progress)));
        progressFill.style.width = `${pct}%`;
        progressWrap.appendChild(progressFill);
        item.appendChild(progressWrap);

        const progressLabel = document.createElement("div");
        progressLabel.className = "progress-label";
        progressLabel.textContent = job.progress === null || job.progress === undefined ? "Progress: —" : `Progress: ${Math.round(pct)}%`;
        item.appendChild(progressLabel);

        if (job.error_message) {
          const error = document.createElement("div");
          error.className = "job-error";
          error.textContent = job.error_message;
          item.appendChild(error);
        }

        activeJobsList.appendChild(item);
      });
    }
  }

  if (recentJobsBody) {
    recentJobsBody.innerHTML = "";
    const jobs = Array.isArray(payload.recent_jobs) ? payload.recent_jobs : [];
    if (!jobs.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "dashboard-placeholder";
      cell.textContent = "No recent jobs.";
      row.appendChild(cell);
      recentJobsBody.appendChild(row);
    } else {
      jobs.forEach(job => {
        const row = document.createElement("tr");
        const cells = [
          job.id || "—",
          job.type || "—",
          job.status || "—",
          job.stage || "—",
          formatProgress(job.progress),
          formatTimestamp(job.updated_at),
        ];
        cells.forEach(text => {
          const cell = document.createElement("td");
          cell.textContent = text;
          row.appendChild(cell);
        });
        recentJobsBody.appendChild(row);
      });
    }
  }

  if (recentAssetsList) {
    recentAssetsList.innerHTML = "";
    const assets = Array.isArray(payload.recent_assets) ? payload.recent_assets : [];
    if (!assets.length) {
      const item = document.createElement("li");
      item.className = "dashboard-placeholder";
      item.textContent = "No assets to display.";
      recentAssetsList.appendChild(item);
    } else {
      assets.forEach(asset => {
        const item = document.createElement("li");
        item.className = "dashboard-asset";
        const labelSpan = document.createElement("span");
        labelSpan.className = "label";
        labelSpan.textContent = `${(asset.asset_type || "Asset").toString().toUpperCase()}:`;
        const detailsSpan = document.createElement("span");
        const parts = [asset.file_path || "(no path)", formatTimestamp(asset.created_at)];
        if (asset.project_id) {
          parts.unshift(`Project ${asset.project_id}`);
        }
        detailsSpan.textContent = parts.join(" • ");
        item.appendChild(labelSpan);
        item.appendChild(detailsSpan);
        recentAssetsList.appendChild(item);
      });
    }
  }

  console.log("[ui-shell] shell controls bound");
}

async function loadDashboardData(force = false, options = {}) {
  const { silent = false } = options;
  const hasDashboard = dashboardProfileList || dashboardProviders || recentJobsBody || recentAssetsList;
  if (!hasDashboard) return;

  if (!authState.user) {
    resetDashboardWidgetsForLoggedOut();
    return;
  }

  const currentUserId = authState.user.id;
  if (!force && (dashboardLoading || lastDashboardUserId === currentUserId)) {
    return;
  }

  lastDashboardUserId = currentUserId;
  dashboardLoading = true;
  if (!silent) setDashboardMessage("Loading dashboard data...");
  clearDashboardError();

  try {
    const resp = await getJSON("/dashboard/data");
    if (!resp.ok || !resp.data) {
      showDashboardError("Unable to load dashboard data");
      if (!silent) setDashboardMessage("");
      lastDashboardUserId = null;
      return;
    }
    setDashboardMessage("");
    renderDashboardData(resp.data);
  } catch (err) {
    console.error("dashboard load failed", err);
    showDashboardError("Unable to load dashboard data");
    setDashboardMessage("");
    lastDashboardUserId = null;
  } finally {
    dashboardLoading = false;
  }
}

function stopDashboardPolling() {
  if (dashboardPollHandle) {
    clearInterval(dashboardPollHandle);
    dashboardPollHandle = null;
  }
}

function startDashboardPolling() {
  stopDashboardPolling();
  if (!authState.user) return;
  dashboardPollHandle = setInterval(() => {
    if (!authState.user) {
      stopDashboardPolling();
      return;
    }
    loadDashboardData(true, { silent: true });
  }, 6000);
}

function setActiveView(viewId) {
  activeViewId = viewId;
  viewSections.forEach(section => {
    section.classList.toggle("active", section.id === viewId);
  });
  let parentToActivate = null;
  navButtons.forEach(btn => {
    const target = btn.dataset.view;
    const isActive = target === viewId;
    btn.classList.toggle("active", isActive);
    if (isActive && btn.dataset.parent) {
      parentToActivate = btn.dataset.parent;
    }
  });
  if (parentToActivate) {
    navButtons.forEach(btn => {
      if (btn.dataset.view === parentToActivate) {
        btn.classList.add("active");
      }
    });
  }
  if (mainContentEl) {
    mainContentEl.dataset.activeView = viewId;
  }

  renderWorkspace(viewId);
}

function changeView(viewId, options = {}) {
  if (!viewId) return;
  const { path, replace = false } = options;
  setActiveView(viewId);

  const targetPath = path || VIEW_PATHS[viewId] || window.location.pathname;
  const state = { viewId };
  if (!window.history) {
    return;
  }

  try {
    if (replace && window.history.replaceState) {
      window.history.replaceState(state, "", targetPath);
    } else if (window.history.pushState) {
      window.history.pushState(state, "", targetPath);
    }
  } catch (err) {
    console.warn("navigation state update failed", err);
  }
}

function updateNavigationForRole(role, { verified = true } = {}) {
  const roleKey = (role || "viewer").toLowerCase();
  const visibleViews = new Set();

  navButtons.forEach(btn => {
    if (!btn) return;
    const allowedRoles = (btn.dataset.roles || "")
      .split(/\s+/)
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    const canSee = allowedRoles.length === 0 || allowedRoles.includes(roleKey);
    btn.classList.toggle("hidden", !canSee);
    if (!canSee) {
      if (btn.dataset.locked) {
        delete btn.dataset.locked;
      }
      btn.classList.remove("locked");
      if (btn.title === VERIFY_NAV_HINT) {
        btn.removeAttribute("title");
      }
      return;
    }

    visibleViews.add(btn.dataset.view);

    if (!verified && btn.dataset.view !== "dashboard-view") {
      btn.dataset.locked = "verify";
      btn.classList.add("locked");
      btn.title = VERIFY_NAV_HINT;
    } else if (btn.dataset.locked === "verify") {
      delete btn.dataset.locked;
      btn.classList.remove("locked");
      if (btn.title === VERIFY_NAV_HINT) {
        btn.removeAttribute("title");
      }
    }
  });

  if (!visibleViews.has(activeViewId)) {
    changeView("dashboard-view", { replace: true });
  }
}

function setToken(token) {
  authState.token = token || null;
  try {
    if (token) {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
  } catch (err) {
    console.warn("token storage failed", err);
  }
}

function clearToken() {
  setToken(null);
  authState.user = null;
}

function syncModalOpenState() {
  const anyOpen = [authOverlay, verificationOverlay, profileModal].some(
    el => el && !el.classList.contains("hidden")
  );
  document.body.classList.toggle("modal-open", anyOpen);
}

function setActiveAuthMode(mode) {
  authTabs.forEach(tab => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle("active", isActive);
  });
  if (overlayLoginForm)
    overlayLoginForm.classList.toggle("active", mode === "login");
  if (overlayRegisterForm)
    overlayRegisterForm.classList.toggle("active", mode === "register");
  setFeedback(authFeedback, "");
}

function showAuthOverlay(mode = "login") {
  if (!authOverlay) return;
  setActiveAuthMode(mode);
  authOverlay.classList.remove("hidden");
  syncModalOpenState();
}

function hideAuthOverlay() {
  if (!authOverlay) return;
  authOverlay.classList.add("hidden");
  syncModalOpenState();
}

function showVerificationOverlay() {
  if (!verificationOverlay) return;
  if (verifyCodeInput) verifyCodeInput.value = "";
  setFeedback(verifyFeedback, "");
  verificationOverlay.classList.remove("hidden");
  syncModalOpenState();
}

function hideVerificationOverlay() {
  if (!verificationOverlay) return;
  verificationOverlay.classList.add("hidden");
  syncModalOpenState();
}

function openProfileModal() {
  if (!profileModal || !authState.user) return;
  hideVerificationOverlay();
  populateProfileForm();
  profileModal.classList.remove("hidden");
  setFeedback(profileFormFeedback, "");
  setFeedback(passwordFormFeedback, "");
  setFeedback(apiKeysFeedback, "");
  setFeedback(smtpConfigFeedback, "");
  setFeedback(smtpTestFeedback, "");
  syncModalOpenState();
  loadApiKeys();
  if (authState.capabilities && authState.capabilities.admin) {
    loadSmtpSettings();
  }
}

function closeProfileModal(options = {}) {
  if (!profileModal) return;
  const { skipVerification = false } = options;
  profileModal.classList.add("hidden");
  syncModalOpenState();
  if (!skipVerification && authState.user && !authState.user.is_verified) {
    showVerificationOverlay();
  }
}

async function performLogout() {
  await postJSON("/auth/logout", undefined, { skipAuthRedirect: true });
  clearToken();
  hideVerificationOverlay();
  closeProfileModal({ skipVerification: true });
  applyUserState();
  showAuthOverlay("login");
}

function setFeedback(el, message, type) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("error", "success");
  if (type === "error") el.classList.add("error");
  if (type === "success") el.classList.add("success");
}

function setApiKeyFormEnabled(enabled) {
  if (!apiKeyForm) return;
  const elements = Array.from(apiKeyForm.elements || []);
  elements.forEach(el => {
    if (!el) return;
    if (el.tagName === "BUTTON" || el.tagName === "INPUT" || el.tagName === "SELECT") {
      el.disabled = !enabled;
    }
  });
}

function updateFeatureAvailability({ verified, capabilities }) {
  const verifyReason = "Verify your email to use this feature";
  const generateReason = "Your role cannot generate content.";
  const publishReason = "Your role cannot publish content.";

  generateControls.forEach(btn => {
    if (!btn) return;
    const shouldLock = !verified || !capabilities.generate;
    if (shouldLock) {
      btn.dataset.locked = !verified ? "verify" : "role";
      btn.disabled = true;
      btn.title = !verified ? verifyReason : generateReason;
    } else {
      if (btn.dataset.locked) {
        delete btn.dataset.locked;
        btn.removeAttribute("title");
      }
      if (!btn.classList.contains("busy")) {
        btn.disabled = false;
      }
    }
  });

  publishControls.forEach(btn => {
    if (!btn) return;
    const shouldLock = !verified || !capabilities.publish;
    if (shouldLock) {
      btn.dataset.locked = !verified ? "verify" : "role";
      btn.disabled = true;
      btn.title = !verified ? verifyReason : publishReason;
    } else {
      if (btn.dataset.locked) {
        delete btn.dataset.locked;
        btn.removeAttribute("title");
      }
      if (!btn.classList.contains("busy")) {
        btn.disabled = false;
      }
    }
  });
}

function applyUserState() {
  const user = authState.user;
  if (!user) {
    stopDashboardPolling();
    resetDashboardWidgetsForLoggedOut();
    if (userActions) userActions.classList.add("hidden");
    if (authActions) authActions.classList.remove("hidden");
    if (docsLink) docsLink.classList.add("hidden");
    document.body.classList.remove("dev-mode");
    updateFeatureAvailability({ verified: false, capabilities: ROLE_CAPABILITIES.viewer });
    if (verificationBanner) verificationBanner.classList.add("hidden");
    if (passwordResetBanner) passwordResetBanner.classList.add("hidden");
    setApiKeyFormEnabled(false);
    if (smtpConfigSection) smtpConfigSection.classList.add("hidden");
    if (brandingConfigSection) brandingConfigSection.classList.add("hidden");
    authState.capabilities = ROLE_CAPABILITIES.viewer;
    updateNavigationForRole("viewer", { verified: false });
    changeView("dashboard-view", { replace: true });
    return;
  }

  const role = (user.role || "viewer").toLowerCase();
  const capabilities = getRoleCapabilities(role);
  authState.capabilities = capabilities;
  const verified = !!user.is_verified;
  updateNavigationForRole(role, { verified });

  if (authActions) authActions.classList.add("hidden");
  if (userActions) userActions.classList.remove("hidden");
  if (userGreeting) {
    const firstName = user.full_name ? user.full_name.split(" ")[0] : user.email;
    userGreeting.textContent = firstName ? `Hi, ${firstName}` : "";
  }

  document.body.classList.toggle("dev-mode", capabilities.admin);
  if (docsLink) docsLink.classList.toggle("hidden", !capabilities.admin);

  updateFeatureAvailability({ verified, capabilities });
  if (verificationBanner) verificationBanner.classList.toggle("hidden", verified);
  if (verified) {
    hideVerificationOverlay();
  }

  if (passwordResetBanner) {
    passwordResetBanner.classList.toggle("hidden", !user.must_change_password);
  }

  setApiKeyFormEnabled(capabilities.manageKeys);
  if (smtpConfigSection) smtpConfigSection.classList.toggle("hidden", !capabilities.admin);
  if (capabilities.admin) {
    loadBrandingSettings();
  } else if (brandingConfigSection) {
    brandingConfigSection.classList.add("hidden");
  }

  populateProfileSummary();
  loadDashboardData(true);
  startDashboardPolling();
}

function populateProfileSummary() {
  const user = authState.user;
  if (!user) return;
  if (profileVerificationStatus) {
    profileVerificationStatus.textContent = user.is_verified ? "Email verified" : "Verification required";
  }
  const role = (user.role || "viewer").toLowerCase();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  if (profileRoleLabel) {
    profileRoleLabel.textContent = `Role: ${roleLabel}`;
  }
  if (rolePermissionsList) {
    rolePermissionsList.innerHTML = "";
    const items = ROLE_DESCRIPTIONS[role] || ROLE_DESCRIPTIONS.viewer;
    items.forEach(text => {
      const li = document.createElement("li");
      li.textContent = text;
      rolePermissionsList.appendChild(li);
    });
  }
}

function populateProfileForm() {
  const user = authState.user;
  if (!user) return;
  if (profileNameInput) profileNameInput.value = user.full_name || "";
  if (profileEmailInput) profileEmailInput.value = user.email || "";
  populateProfileSummary();
}

function handleUnauthorized() {
  clearToken();
  applyUserState();
  showAuthOverlay("login");
}

function getToken() {
  return authState.token || "";
}

function authHeaders() {
  const token = getToken();
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function postJSON(url, bodyObj, options = {}) {
  const hasBody = bodyObj !== undefined;
  const headers = {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...authHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    body: hasBody ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (res.status === 401 && !options.skipAuthRedirect) {
    handleUnauthorized();
  }
  return { ok: res.ok, status: res.status, data };
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
    credentials: "include",
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (res.status === 401 && !options.skipAuthRedirect) {
    handleUnauthorized();
  }
  return { ok: res.ok, status: res.status, data };
}

async function deleteJSON(url, options = {}) {
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
    credentials: "include",
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (res.status === 401 && !options.skipAuthRedirect) {
    handleUnauthorized();
  }
  return { ok: res.ok, status: res.status, data };
}

async function refreshSession() {
  if (!authState.token) {
    applyUserState();
    return;
  }
  const resp = await getJSON("/me", { skipAuthRedirect: true });
  if (resp.ok) {
    authState.user = resp.data;
    applyUserState();
  } else if (resp.status === 401) {
    clearToken();
    applyUserState();
  }
}

async function loadApiKeys() {
  if (!apiKeysList) return;
  apiKeysList.innerHTML = "";
  setFeedback(apiKeysFeedback, "");
  if (!authState.user) {
    apiKeysList.innerHTML = '<p class="help-text">Log in to manage API keys.</p>';
    setApiKeyFormEnabled(false);
    return;
  }
  if (!authState.user.is_verified) {
    apiKeysList.innerHTML = '<p class="help-text">Verify your email to manage API keys.</p>';
    setApiKeyFormEnabled(false);
    return;
  }
  const capabilities = authState.capabilities || getRoleCapabilities(authState.user.role);
  if (!capabilities.manageKeys) {
    apiKeysList.innerHTML = '<p class="help-text">Your role cannot manage API keys.</p>';
    setFeedback(apiKeysFeedback, "", null);
    setApiKeyFormEnabled(false);
    return;
  }
  setApiKeyFormEnabled(true);
  const resp = await getJSON("/profile/keys");
  if (!resp.ok) {
    const message = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Could not load API keys.";
    apiKeysList.innerHTML = `<p class="help-text error">${message}</p>`;
    return;
  }
  const providers = (resp.data && resp.data.providers) || [];
  if (!providers.length) {
    apiKeysList.innerHTML = '<p class="help-text">No keys saved yet.</p>';
    return;
  }
  providers.forEach(provider => {
    const item = document.createElement("div");
    item.className = "api-key-item";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = provider;
    const removeBtn = document.createElement("button");
    removeBtn.className = "api-key-remove";
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      const respDel = await deleteJSON(`/profile/keys/${provider}`);
      if (!respDel.ok) {
        const msg = respDel.data && (respDel.data.error || respDel.data.detail) ? (respDel.data.error || respDel.data.detail) : "Failed to remove API key.";
        setFeedback(apiKeysFeedback, msg, "error");
      } else {
        setFeedback(apiKeysFeedback, `${provider} key removed.`, "success");
      }
      await loadApiKeys();
      await loadDashboardData(true);
    });
    item.appendChild(nameSpan);
    item.appendChild(removeBtn);
    apiKeysList.appendChild(item);
  });
}

async function loadBrandingSettings() {
  if (!brandingConfigSection) return;
  const isAdmin = authState.capabilities && authState.capabilities.admin;
  brandingConfigSection.classList.toggle("hidden", !isAdmin);
  if (!isAdmin) {
    return;
  }

  setFeedback(brandingFeedback, "");
  try {
    const resp = await getJSON("/admin/system/branding");
    if (!resp.ok) {
      const msg =
        resp.data && (resp.data.error || resp.data.detail)
          ? resp.data.error || resp.data.detail
          : "Unable to load branding settings.";
      setFeedback(brandingFeedback, msg, "error");
      return;
    }
    const badgeText =
      resp.data && resp.data.badge_text ? resp.data.badge_text : brandMarkDefault;
    applyBrandingBadge(badgeText);
    if (brandingBadgeInput) {
      brandingBadgeInput.value = badgeText;
    }
    setFeedback(brandingFeedback, "", null);
  } catch (err) {
    console.error("branding settings load failed", err);
    setFeedback(brandingFeedback, "Unable to load branding settings.", "error");
  }
}

async function loadSmtpSettings() {
  if (!smtpConfigSection) return;
  const isAdmin = authState.capabilities && authState.capabilities.admin;
  smtpConfigSection.classList.toggle("hidden", !isAdmin);
  if (!isAdmin) {
    return;
  }

  if (smtpPasswordInput) smtpPasswordInput.value = "";
  setFeedback(smtpConfigFeedback, "");
  const resp = await getJSON("/admin/system/smtp");
  if (!resp.ok) {
    const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Unable to load SMTP settings.";
    setFeedback(smtpConfigFeedback, msg, "error");
    return;
  }
  const data = resp.data || {};
  if (smtpHostInput) smtpHostInput.value = data.host || "";
  if (smtpPortInput) smtpPortInput.value = data.port !== undefined && data.port !== null ? data.port : "";
  if (smtpUsernameInput) smtpUsernameInput.value = data.username || "";
  if (smtpFromAddressInput) smtpFromAddressInput.value = data.from_address || "";
  if (smtpUseTlsInput) smtpUseTlsInput.checked = data.use_tls !== false;
  if (smtpConfigFeedback) {
    if (data.configured_via_env) {
      setFeedback(smtpConfigFeedback, "Currently using environment configuration. Saving will override it.");
    } else if (data.password_set) {
      setFeedback(smtpConfigFeedback, "SMTP password is set. Leave the field blank to keep the current password.");
    } else {
      setFeedback(smtpConfigFeedback, "", null);
    }
  }
}

async function handleLoginFromForm(formEl) {
  if (!formEl || !loginEmailInput || !loginPasswordInput) return;
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value.trim();
  const submitBtn = formEl.querySelector("button[type='submit']");
  await withButtonWorkingState(submitBtn, async () => {
    const resp = await postJSON("/auth/login", { email, password }, { skipAuthRedirect: true });
    if (!resp.ok) {
      const msg =
        resp.data && (resp.data.error || resp.data.detail)
          ? resp.data.error || resp.data.detail
          : "Login failed.";
      setFeedback(authFeedback, msg, "error");
      return;
    }

    const { token, user, requires_verification, must_change_password } = resp.data || {};
    if (!token || !user) {
      setFeedback(authFeedback, "Unexpected login response.", "error");
      return;
    }

    if (typeof must_change_password !== "undefined") {
      user.must_change_password = must_change_password;
    }

    setToken(token);
    authState.user = user;
    applyUserState();
    setFeedback(authFeedback, "Logged in successfully.", "success");
    hideAuthOverlay();

    if (requires_verification) {
      showVerificationOverlay();
    } else {
      await refreshSession();
    }
  });
}

function wireAuthUI() {
  if (overlayLoginForm) {
    overlayLoginForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      await handleLoginFromForm(overlayLoginForm);
    });
  }

  if (overlayRegisterForm) {
    overlayRegisterForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!registerNameInput || !registerEmailInput || !registerPasswordInput) return;
      const payload = {
        full_name: registerNameInput.value.trim(),
        email: registerEmailInput.value.trim(),
        password: registerPasswordInput.value.trim(),
      };
      const submitBtn = overlayRegisterForm.querySelector("button[type='submit']");
      await withButtonWorkingState(submitBtn, async () => {
        const resp = await postJSON("/auth/register", payload, { skipAuthRedirect: true });
        if (!resp.ok) {
          const msg =
            resp.data && (resp.data.error || resp.data.detail)
              ? resp.data.error || resp.data.detail
              : "Registration failed.";
          setFeedback(authFeedback, msg, "error");
          return;
        }

        const message =
          resp.data && resp.data.message
            ? resp.data.message
            : "Account created. Log in to continue.";
        const emailSent =
          resp.data && Object.prototype.hasOwnProperty.call(resp.data, "email_sent")
            ? !!resp.data.email_sent
            : true;
        setActiveAuthMode("login");
        setFeedback(authFeedback, message, emailSent ? "success" : "error");
      });
    });
  }
}

authTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setActiveAuthMode(tab.dataset.mode || "login");
  });
});

if (verifyForm) {
  verifyForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!verifyCodeInput) return;
    const code = verifyCodeInput.value.trim();
    if (!code) {
      setFeedback(verifyFeedback, "Enter the verification code.", "error");
      return;
    }
    const submitBtn = verifyForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/auth/verify-email", { code });
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Verification failed.";
        setFeedback(verifyFeedback, msg, "error");
        return;
      }
      const updated = resp.data && resp.data.user ? resp.data.user : null;
      if (updated) {
        authState.user = updated;
        applyUserState();
      } else {
        await refreshSession();
      }
      setFeedback(verifyFeedback, "Email verified. You're all set!", "success");
      setTimeout(() => hideVerificationOverlay(), 800);
    });
  });
}

if (resendCodeButton) {
  resendCodeButton.addEventListener("click", async () => {
    resendCodeButton.disabled = true;
    const resp = await postJSON("/auth/resend-verification", undefined, { skipAuthRedirect: true });
    resendCodeButton.disabled = false;
    if (!resp.ok) {
      const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Could not resend verification code.";
      setFeedback(verifyFeedback, msg, "error");
      return;
    }
    const message = resp.data && resp.data.message ? resp.data.message : "Verification code reissued.";
    const emailSent = resp.data && Object.prototype.hasOwnProperty.call(resp.data, "email_sent") ? !!resp.data.email_sent : true;
    setFeedback(verifyFeedback, message, emailSent ? "success" : "error");
  });
}

if (verifyOpenProfileButton) {
  verifyOpenProfileButton.addEventListener("click", () => {
    openProfileModal();
  });
}

if (verifyLogoutButton) {
  verifyLogoutButton.addEventListener("click", async () => {
    await withButtonWorkingState(verifyLogoutButton, performLogout);
  });
}

if (openPasswordResetButton) {
  openPasswordResetButton.addEventListener("click", () => {
    openProfileModal();
    if (passwordForm) {
      passwordForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

if (profileForm) {
  profileForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!profileNameInput || !profileEmailInput) return;
    const payload = {
      full_name: profileNameInput.value.trim(),
      email: profileEmailInput.value.trim(),
    };
    const submitBtn = profileForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/profile", payload);
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Failed to update profile.";
        setFeedback(profileFormFeedback, msg, "error");
        return;
      }
      if (resp.data && resp.data.user) {
        authState.user = resp.data.user;
        applyUserState();
      } else {
        await refreshSession();
      }
      const requiresVerification = resp.data && !!resp.data.requires_verification;
      const message = resp.data && resp.data.message ? resp.data.message : "Profile updated.";
      const emailSent = resp.data && Object.prototype.hasOwnProperty.call(resp.data, "email_sent") ? !!resp.data.email_sent : true;
      setFeedback(profileFormFeedback, message, emailSent ? "success" : "error");
      if (requiresVerification) {
        showVerificationOverlay();
      }
    });
  });
}

if (passwordForm) {
  passwordForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!currentPasswordInput || !newPasswordInput) return;
    const payload = {
      current_password: currentPasswordInput.value,
      new_password: newPasswordInput.value,
    };
    const submitBtn = passwordForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/profile/password", payload);
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Failed to change password.";
        setFeedback(passwordFormFeedback, msg, "error");
        return;
      }
      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      if (resp.data && resp.data.user) {
        authState.user = resp.data.user;
        applyUserState();
      } else {
        await refreshSession();
      }
      setFeedback(passwordFormFeedback, "Password updated.", "success");
    });
  });
}

if (apiKeyForm) {
  apiKeyForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!apiKeyProviderInput || !apiKeySecretInput) return;
    const payload = {
      provider: apiKeyProviderInput.value.trim(),
      secret: apiKeySecretInput.value.trim(),
    };
    if (!payload.provider || !payload.secret) {
      setFeedback(apiKeysFeedback, "Provider and secret are required.", "error");
      return;
    }
    const capabilities = authState.capabilities || getRoleCapabilities(authState.user && authState.user.role);
    if (!capabilities.manageKeys) {
      setFeedback(apiKeysFeedback, "Your role cannot manage API keys.", "error");
      return;
    }
    const submitBtn = apiKeyForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/profile/keys", payload);
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Failed to store API key.";
        setFeedback(apiKeysFeedback, msg, "error");
        return;
      }
      apiKeySecretInput.value = "";
      setFeedback(apiKeysFeedback, `${payload.provider} key saved.`, "success");
      await loadApiKeys();
      await loadDashboardData(true);
    });
  });
}

if (smtpConfigForm) {
  smtpConfigForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!authState.capabilities || !authState.capabilities.admin) {
      setFeedback(smtpConfigFeedback, "Admin role required to update SMTP settings.", "error");
      return;
    }
    const payload = {};
    if (smtpHostInput) payload.host = smtpHostInput.value.trim();
    if (smtpPortInput && smtpPortInput.value !== "") {
      const portValue = Number(smtpPortInput.value);
      if (!Number.isNaN(portValue)) {
        payload.port = portValue;
      }
    }
    payload.use_tls = smtpUseTlsInput ? !!smtpUseTlsInput.checked : true;
    if (smtpUsernameInput) payload.username = smtpUsernameInput.value.trim();
    if (smtpFromAddressInput) payload.from_address = smtpFromAddressInput.value.trim();
    if (smtpPasswordInput && smtpPasswordInput.value) {
      payload.password = smtpPasswordInput.value;
    }
    const submitBtn = smtpConfigForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/admin/system/smtp", payload);
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Failed to save SMTP settings.";
        setFeedback(smtpConfigFeedback, msg, "error");
        return;
      }
      if (smtpPasswordInput) smtpPasswordInput.value = "";
      setFeedback(smtpConfigFeedback, "SMTP settings saved.", "success");
      await loadSmtpSettings();
    });
  });
}

if (smtpTestForm) {
  smtpTestForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!authState.capabilities || !authState.capabilities.admin) {
      setFeedback(smtpTestFeedback, "Admin role required to send test emails.", "error");
      return;
    }
    if (!smtpTestRecipientInput) return;
    const to = smtpTestRecipientInput.value.trim();
    if (!to) {
      setFeedback(smtpTestFeedback, "Enter a test recipient email.", "error");
      return;
    }
    const submitBtn = smtpTestForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/admin/system/smtp/test", { to });
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "SMTP test failed.";
        setFeedback(smtpTestFeedback, msg, "error");
        return;
      }
      setFeedback(smtpTestFeedback, "Test email sent.", "success");
    });
  });
}

if (brandingForm) {
  brandingForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!authState.capabilities || !authState.capabilities.admin) {
      setFeedback(brandingFeedback, "Admin role required to update branding.", "error");
      return;
    }

    const badgeValue = brandingBadgeInput ? brandingBadgeInput.value : "";
    const submitBtn = brandingForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/admin/system/branding", { badge_text: badgeValue });
      if (!resp.ok) {
        const msg =
          resp.data && (resp.data.error || resp.data.detail)
            ? resp.data.error || resp.data.detail
            : "Unable to save branding.";
        setFeedback(brandingFeedback, msg, "error");
        return;
      }

      const badgeText =
        resp.data && resp.data.branding && resp.data.branding.badge_text
          ? resp.data.branding.badge_text
          : badgeValue;
      applyBrandingBadge(badgeText);
      if (brandingBadgeInput) {
        brandingBadgeInput.value = badgeText;
      }
      setFeedback(brandingFeedback, "Branding saved.", "success");
    });
  });
}

if (openLoginButton) {
  openLoginButton.addEventListener("click", () => {
    showAuthOverlay("login");
  });
}

if (openAuthFromPublishButton) {
  openAuthFromPublishButton.addEventListener("click", () => {
    showAuthOverlay("login");
  });
}

if (profileButton) {
  profileButton.addEventListener("click", () => {
    if (!authState.user) {
      showAuthOverlay("login");
      return;
    }
    openProfileModal();
  });
}

if (openSystemProfileButton) {
  openSystemProfileButton.addEventListener("click", () => {
    if (!authState.user) {
      showAuthOverlay("login");
      return;
    }
    openProfileModal();
  });
}

if (closeProfileModalBtn) {
  closeProfileModalBtn.addEventListener("click", () => {
    closeProfileModal();
  });
}

if (profileModal) {
  profileModal.addEventListener("click", (ev) => {
    if (ev.target === profileModal) {
      closeProfileModal();
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await withButtonWorkingState(logoutButton, performLogout);
  });
}

if (openVerificationButton) {
  openVerificationButton.addEventListener("click", () => {
    showVerificationOverlay();
  });
}

if (authOverlay) {
  authOverlay.addEventListener("click", (ev) => {
    if (ev.target === authOverlay) {
      // keep modal visible to enforce authentication
    }
  });
}

function initializeAuth() {
  // 1) Start from a "logged-out" UI
  if (typeof userActions !== "undefined" && userActions) {
    userActions.classList.add("hidden");
  }

  // 2) Apply whatever we currently know about the user (likely "viewer")
  if (typeof applyUserState === "function") {
    // pass true if your version uses "initial" flag
    applyUserState(true);
  } else if (typeof updateProtectedUI === "function") {
    // backward-compat; some older builds used this name
    updateProtectedUI();
  }

  // 3) Try to restore token from localStorage (if we ever saved it)
  try {
    const stored = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (stored) {
      authState.token = stored;
    }
  } catch (err) {
    console.warn("could not restore token", err);
  }

  // 4) Ask the backend "who am I?" using the cookie/token
  refreshSession()
    .then(() => {
      // if backend says "nope", show the login overlay
      if (!authState.user) {
        showAuthOverlay("login");
      } else {
        // if we DO have a user, make sure the UI reflects it
        if (typeof applyUserState === "function") {
          applyUserState(false);
        }
      }
    })
    .catch((err) => {
      console.warn("auth refresh failed", err);
      showAuthOverlay("login");
    });
}


wireAuthUI();
setActiveAuthMode("login");
initializeAuth();

// =========================
// Helpers
// =========================
async function withButtonWorkingState(btn, fn) {
  if (!btn) return fn();
  const originalText = btn.textContent;
  const originallyDisabled = btn.disabled;
  btn.disabled = true;
  btn.textContent = "Working...";
  btn.classList.add("busy");
  try {
    return await fn();
  } finally {
    btn.classList.remove("busy");
    btn.textContent = originalText;
    if (btn.dataset.locked) {
      btn.disabled = true;
    } else {
      btn.disabled = originallyDisabled;
    }
  }
}

function normalizePercent(rawValue, lastValue = 0) {
  if (rawValue === undefined || rawValue === null) {
    return lastValue;
  }

  let num = Number(rawValue);
  if (!Number.isFinite(num)) {
    return lastValue;
  }

  if (num >= 0 && num <= 1) {
    num *= 100;
  }

  num = Math.min(Math.max(num, 0), 100);
  return num;
}

// =========================
// TAB SWITCHING
// =========================

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    // update tab button active state
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // show correct panel
    const tgt = btn.getAttribute("data-target");
    document.querySelectorAll(".tab-panel").forEach(p => {
      if (p.id === tgt) p.classList.add("active");
      else p.classList.remove("active");
    });
  });
});

window.addEventListener("popstate", event => {
  const state = event.state || {};
  const targetView = state.viewId || initialActiveView;
  setActiveView(targetView);
  if (targetView === "dashboard-view") {
    loadDashboardData(true, { silent: true });
  }
});

if (refreshJobsButton) {
  refreshJobsButton.addEventListener("click", () => {
    loadDashboardData(true);
  });
}

// =========================
// IMAGINE TAB
// =========================
const imagineSendBtn = document.getElementById("imagineSendBtn");
const imagineInput = document.getElementById("imagineInput");
const imagineOutput = document.getElementById("imagineOutput");

if (imagineSendBtn) {
  imagineSendBtn.addEventListener("click", async () => {
    await withButtonWorkingState(imagineSendBtn, async () => {
      imagineOutput.textContent = "Loading...";

      const userMsg = imagineInput.value.trim() || "Help me brainstorm a lo-fi video concept.";
      const resp = await postJSON("/imagine/chat", { message: userMsg });

      if (!resp.ok) {
        if (resp.data && resp.data.detail) {
          imagineOutput.textContent = "Error: " + resp.data.detail;
        } else {
          imagineOutput.textContent = "Error (status " + resp.status + ")";
        }
        return;
      }

      if (resp.data && resp.data.reply) {
        imagineOutput.textContent = resp.data.reply;
      } else {
        imagineOutput.textContent = JSON.stringify(resp.data, null, 2);
      }
    });
  });
}

// =========================
// CREATE TAB: VIDEO GENERATION
// =========================
const videoGenerateBtn = document.getElementById("videoGenerateBtn");
const videoPrompt = document.getElementById("videoPrompt");
const videoDuration = document.getElementById("videoDuration");
const videoSize = document.getElementById("videoSize");
const videoLoop = document.getElementById("videoLoop");
const videoResult = document.getElementById("videoResult");
const videoPreview = document.getElementById("videoPreview");

let lastVideoDurationSeconds = videoDuration ? parseInt(videoDuration.value, 10) || 8 : 8;
let lastVideoSize = videoSize && videoSize.value ? String(videoSize.value) : "720x1280";

// master fields we may autofill
const masterLoopPath = document.getElementById("masterLoopPath");
const masterSongPath = document.getElementById("masterSongPath");
const masterVOPath = document.getElementById("masterVOPath");
const masterResult = document.getElementById("masterResult");
const masterPreview = document.getElementById("masterPreview");
const ytVideoPath = document.getElementById("ytVideoPath");

// --- progress bar UI state ---
let videoOriginalBtnHTML = "";
let videoIsRendering = false;
let videoLastPct = 0;

function initVideoProgressUI() {
  if (!videoGenerateBtn) return;
  if (!videoOriginalBtnHTML) {
    videoOriginalBtnHTML = videoGenerateBtn.innerHTML;
  }
}

function setVideoProgressUI(percent, statusText) {
  if (!videoGenerateBtn) return;
  const safePct = normalizePercent(percent, videoLastPct);
  videoLastPct = safePct;
  const labelText = statusText || "Rendering";
  const displayPct = Math.round(safePct);

  videoGenerateBtn.disabled = true;
  videoGenerateBtn.classList.add("busy");
  videoGenerateBtn.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-bar" style="width:${safePct}%;"></div>
      <div class="progress-label">${labelText} ${displayPct}%</div>
    </div>
  `;
}

function restoreVideoButtonUI(finalLabel, isError = false) {
  if (!videoGenerateBtn) return;
  videoGenerateBtn.disabled = false;
  videoGenerateBtn.classList.remove("busy");

  if (finalLabel) {
    videoGenerateBtn.innerHTML = finalLabel;
    if (isError) {
      videoGenerateBtn.style.background = "#b91c1c"; // red-ish error state
    } else {
      videoGenerateBtn.style.background = "";
    }
  } else {
    videoGenerateBtn.innerHTML = videoOriginalBtnHTML || "Generate Video";
    videoGenerateBtn.style.background = "";
  }

  videoIsRendering = false;
  videoLastPct = 0;
}

function applyReadyVideo(loopPath) {
  if (!loopPath) return;
  const safePath = "/" + loopPath.replace(/^\//, "");

  // show preview
  if (videoPreview) {
    videoPreview.src = safePath;
  }

  // autofill Master tab loop_path
  if (masterLoopPath) {
    masterLoopPath.value = loopPath;
  }

  // optional: also prep YouTube step by default
  if (ytVideoPath && ytVideoPath.value.trim() === "") {
    ytVideoPath.value = loopPath;
  }
}

// poll status until job is done or failed
async function pollVideoJob(jobId) {
  videoIsRendering = true;
  const MAX_STATUS_ATTEMPTS = 5;
  const INITIAL_BACKOFF_MS = 1200;
  const MAX_BACKOFF_MS = 8000;
  let consecutiveErrors = 0;
  let backoffMs = INITIAL_BACKOFF_MS;

  while (videoIsRendering) {
    let statusResp;
    try {
      statusResp = await getJSON(`/generate/video/status?job_id=${encodeURIComponent(jobId)}`);
    } catch (err) {
      consecutiveErrors += 1;
      const errMsg = err instanceof Error ? err.message : String(err);
      videoResult.textContent = `Status request failed (attempt ${consecutiveErrors}/${MAX_STATUS_ATTEMPTS}): ${errMsg}`;

      if (consecutiveErrors >= MAX_STATUS_ATTEMPTS) {
        restoreVideoButtonUI("Status error", true);
        videoResult.textContent += "\nStopped polling after repeated errors.";
        return;
      }

      await new Promise(res => setTimeout(res, backoffMs));
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      continue;
    }

    const st = statusResp.data || {};

    // always dump to debug box so you can see raw
    videoResult.textContent = JSON.stringify(st, null, 2);

    if (!statusResp.ok) {
      if (statusResp.status >= 500) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_STATUS_ATTEMPTS) {
          restoreVideoButtonUI("Status error", true);
          videoResult.textContent = `Video status failed with HTTP ${statusResp.status} after repeated retries.\n` +
            JSON.stringify(statusResp.data, null, 2);
          return;
        }

        videoResult.textContent = `Video status retry (${consecutiveErrors}/${MAX_STATUS_ATTEMPTS}) due to HTTP ${statusResp.status}.`;
        await new Promise(res => setTimeout(res, backoffMs));
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        continue;
      }

      restoreVideoButtonUI("Error", true);
      videoResult.textContent = "Error polling status:\n" +
        JSON.stringify(statusResp.data, null, 2);
      return;
    }

    // success: reset error counters
    consecutiveErrors = 0;
    backoffMs = INITIAL_BACKOFF_MS;

    // read model fields
    // examples: "in_progress", "completed", "video.failed", "ready", etc.
    const status = st.status || "";
    const pct = normalizePercent(st.progress, videoLastPct);

    // update UI for progress
    if (status === "in_progress" || status === "processing" || status === "generating" || status === "queued") {
      setVideoProgressUI(pct, "Rendering");
    } else {
      // if status came back but not in_progress anymore, show last %
      setVideoProgressUI(pct, status);
    }

    // check for fail states
    if (
      status === "failed" ||
      status === "video.failed" ||
      status === "error"
    ) {
      restoreVideoButtonUI("Failed", true);
      videoResult.textContent = "Video generation failed:\n" +
        JSON.stringify(st, null, 2);
      return;
    }

    // check for success states
    const completedStatuses = ["completed", "ready", "video.completed"];
    const hasAssetPath = typeof st.loop_path === "string" && st.loop_path.length > 0;
    const completed =
      completedStatuses.includes(status) ||
      hasAssetPath ||
      pct >= 99.5;

    if (completed) {
      if (hasAssetPath) {
        setVideoProgressUI(100, "Done");
        restoreVideoButtonUI(null, false); // go back to normal button face

        // Show final preview and wire path forward
        applyReadyVideo(st.loop_path);
        return;
      }

      // backend may report 100% but still preparing asset; keep polling
      setVideoProgressUI(100, status || "finalizing");
    }

    // still not done -> wait 3s and repeat
    await new Promise(res => setTimeout(res, 3000));
  }
}

// handle click -> kick job off
if (videoGenerateBtn) {
  videoGenerateBtn.addEventListener("click", async () => {
    if (videoIsRendering) return; // ignore double clicks during render

    initVideoProgressUI();

    // reset UI
    if (videoPreview) videoPreview.removeAttribute("src");
    videoResult.textContent = "Starting request...";
    videoLastPct = 0;
    setVideoProgressUI(0, "Starting");
    videoIsRendering = true;

    // build request body
    const durationSeconds = videoDuration ? parseInt(videoDuration.value, 10) || 4 : 4;
    const rawSizeValue = videoSize && videoSize.value ? String(videoSize.value).trim() : "";
    const normalizedSize = rawSizeValue || lastVideoSize || "720x1280";

    lastVideoDurationSeconds = durationSeconds;
    lastVideoSize = normalizedSize;

    const body = {
      prompt: videoPrompt.value.trim(),
      duration_seconds: durationSeconds,
      size: normalizedSize,
      loop_hint: videoLoop.checked,
    };

    // request generation from backend
    const resp = await postJSON("/generate/video", body);

    // surface raw response for transparency
    videoResult.textContent = JSON.stringify(resp.data, null, 2);

    if (!resp.ok) {
      restoreVideoButtonUI("Error", true);
      const detail = resp.data && resp.data.detail;
      const msg = detail
        ? (typeof detail === "string" ? detail : JSON.stringify(detail, null, 2))
        : ("Request failed with status " + resp.status);
      videoResult.textContent = "Error:\n" + msg;
      videoIsRendering = false;
      return;
    }

    // Case: backend already finished instantly and gave us final path
    if (resp.data && resp.data.status === "completed" && resp.data.loop_path) {
      restoreVideoButtonUI(null, false);
      applyReadyVideo(resp.data.loop_path);
      videoIsRendering = false;
      return;
    }

    // Case: job created: we got an ID we can track, plus maybe initial progress
    if (resp.data && resp.data.provider_job_id) {
      const jid = resp.data.provider_job_id;

      // show initial progress if we have it
      if (resp.data.progress !== undefined) {
        setVideoProgressUI(resp.data.progress, "Rendering");
      }

      // now actively poll until done or failed
      pollVideoJob(jid);
      return;
    }

    // Fallback: no job id, no loop_path, something unexpected
    restoreVideoButtonUI("No job?", true);
    videoResult.textContent +=
      "\nNo provider_job_id or loop_path returned; cannot monitor progress.";
    videoIsRendering = false;
  });
}




// =========================
// CREATE TAB: MUSIC GENERATION
// =========================
const musicGenerateBtn = document.getElementById("musicGenerateBtn");
const musicPrompt = document.getElementById("musicPrompt");
const musicDuration = document.getElementById("musicDuration");
const musicMood = document.getElementById("musicMood");
const musicGenre = document.getElementById("musicGenre");
const musicResult = document.getElementById("musicResult");
const musicPreview = document.getElementById("musicPreview");

let musicOriginalBtnHTML = "";
let musicIsGenerating = false;
let musicLastPct = 0;
let lastMusicDurationSeconds = 180;

if (musicDuration) {
  const initialMusicDuration = parseInt(musicDuration.value, 10);
  if (!Number.isNaN(initialMusicDuration) && initialMusicDuration > 0) {
    lastMusicDurationSeconds = initialMusicDuration;
  }
}

function initMusicProgressUI() {
  if (!musicGenerateBtn) return;
  if (!musicOriginalBtnHTML) {
    musicOriginalBtnHTML = musicGenerateBtn.innerHTML;
  }
}

function setMusicProgressUI(percent, statusText) {
  if (!musicGenerateBtn) return;
  const safePct = normalizePercent(percent, musicLastPct);
  musicLastPct = safePct;
  const labelText = statusText || "Generating";
  const displayPct = Math.round(safePct);
  
  musicGenerateBtn.disabled = true;
  musicGenerateBtn.classList.add("busy");
  musicGenerateBtn.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-bar" style="width:${safePct}%;"></div>
      <div class="progress-label">${labelText} ${displayPct}%</div>
    </div>
  `;
}

function restoreMusicButtonUI(finalLabel, isError = false) {
  if (!musicGenerateBtn) return;
  musicGenerateBtn.disabled = false;
  musicGenerateBtn.classList.remove("busy");
  
  if (finalLabel) {
    musicGenerateBtn.innerHTML = finalLabel;
    musicGenerateBtn.style.background = isError ? "#b91c1c" : "";
  } else {
    musicGenerateBtn.innerHTML = musicOriginalBtnHTML || "Generate Music";
    musicGenerateBtn.style.background = "";
  }
  
  musicIsGenerating = false;
  musicLastPct = 0;
}

function applyReadySong(songPath) {
  if (!songPath) return;
  const safePath = "/" + songPath.replace(/^\//, "");
  if (musicPreview) {
    musicPreview.src = safePath;
  }
  if (masterSongPath) {
    masterSongPath.value = songPath;
  }
}

async function pollMusicJob(jobId) {
  musicIsGenerating = true;
  
  while (musicIsGenerating) {
    const statusResp = await getJSON(`/generate/music/status?job_id=${encodeURIComponent(jobId)}`);
    const st = statusResp.data || {};

    musicResult.textContent = JSON.stringify(st, null, 2);

    if (!statusResp.ok) {
      restoreMusicButtonUI("Error", true);
      musicResult.textContent = "Error polling status:\n" +
        JSON.stringify(statusResp.data, null, 2);
      return;
    }

    const status = st.status || "";
    const pct = normalizePercent(st.progress, musicLastPct);
    const hasSong = typeof st.song_path === "string" && st.song_path.length > 0;

    if (["queued", "processing", "running", "generating"].includes(status)) {
      setMusicProgressUI(pct, "Rendering");
    } else if (status) {
      setMusicProgressUI(pct, status);
    }

    if (["failed", "error"].includes(status)) {
      restoreMusicButtonUI("Failed", true);
      musicResult.textContent = "Music generation failed:\n" +
        JSON.stringify(st, null, 2);
      return;
    }

    if (hasSong) {
      setMusicProgressUI(100, "Done");
      restoreMusicButtonUI(null, false);
      applyReadySong(st.song_path);
      return;
    }

    if (["completed", "ready", "succeeded"].includes(status) || pct >= 100) {
      setMusicProgressUI(100, status || "finalizing");
    }

    await new Promise(res => setTimeout(res, 3000));
  }
}

if (musicGenerateBtn) {
  musicGenerateBtn.addEventListener("click", async () => {
    if (musicIsGenerating) return;
  
    initMusicProgressUI();
  
    if (musicPreview) musicPreview.removeAttribute("src");
    musicResult.textContent = "Starting request...";
    musicLastPct = 0;
    setMusicProgressUI(0, "Starting");
    musicIsGenerating = true;
  
    const durationSeconds = parseInt(musicDuration.value, 10) || 180;
    lastMusicDurationSeconds = durationSeconds;

    const body = {
      prompt: musicPrompt.value.trim(),
      duration_seconds: durationSeconds,
      mood: musicMood.value.trim(),
      genre: musicGenre.value.trim()
    };

    const resp = await postJSON("/generate/music", body);

    musicResult.textContent = JSON.stringify(resp.data, null, 2);

    if (!resp.ok) {
      restoreMusicButtonUI("Error", true);
      const detail = resp.data && resp.data.detail;
      const msg = detail
        ? (typeof detail === "string" ? detail : JSON.stringify(detail, null, 2))
        : ("Request failed with status " + resp.status);
      musicResult.textContent = "Error:\n" + msg;
      return;
    }

    if (resp.data && resp.data.song_path && resp.data.status === "ready") {
      restoreMusicButtonUI(null, false);
      applyReadySong(resp.data.song_path);
      return;
    }

    if (resp.data && resp.data.provider_job_id) {
      if (resp.data.progress !== undefined) {
        setMusicProgressUI(resp.data.progress, "Rendering");
      }
      pollMusicJob(resp.data.provider_job_id);
      return;
    }

    restoreMusicButtonUI("No job?", true);
    musicResult.textContent +=
      "\nNo provider_job_id or song_path returned; cannot monitor progress.";
  });
}

// =========================
// CREATE TAB: MASTERING
// =========================
const masterBuildBtn = document.getElementById("masterBuildBtn");

let masterOriginalBtnHTML = "";
let masterIsBuilding = false;
let masterLastPct = 0;

function initMasterProgressUI() {
  if (!masterBuildBtn) return;
  if (!masterOriginalBtnHTML) {
    masterOriginalBtnHTML = masterBuildBtn.innerHTML;
  }
}

function setMasterProgressUI(percent, statusText) {
  if (!masterBuildBtn) return;
  const safePct = normalizePercent(percent, masterLastPct);
  masterLastPct = safePct;
  const labelText = statusText || "Building";
  const displayPct = Math.round(safePct);

  masterBuildBtn.disabled = true;
  masterBuildBtn.classList.add("busy");
  masterBuildBtn.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-bar" style="width:${safePct}%;"></div>
      <div class="progress-label">${labelText} ${displayPct}%</div>
    </div>
  `;
}

function restoreMasterButtonUI(finalLabel, isError = false) {
  if (!masterBuildBtn) return;
  masterBuildBtn.disabled = false;
  masterBuildBtn.classList.remove("busy");

  if (finalLabel) {
    masterBuildBtn.innerHTML = finalLabel;
    masterBuildBtn.style.background = isError ? "#b91c1c" : "";
  } else {
    masterBuildBtn.innerHTML = masterOriginalBtnHTML || "Build Final Video";
    masterBuildBtn.style.background = "";
  }

  masterIsBuilding = false;
  masterLastPct = 0;
}

function applyMasterVideo(result) {
  if (!result) return;

  const payload = typeof result === "string"
    ? { disk_path: result }
    : result;

  const rawPublic = payload.public_url || payload.publicUrl;
  const rawDisk = payload.disk_path || payload.diskPath || payload.master_path;

  const normalizedDisk = rawDisk ? rawDisk.replace(/\\/g, "/") : "";
  const relativeDisk = normalizedDisk.includes("static/")
    ? normalizedDisk.substring(normalizedDisk.indexOf("static/"))
    : normalizedDisk.replace(/^\/+/, "");

  const finalPublicUrl = rawPublic
    ? (rawPublic.startsWith("/") ? rawPublic : `/${rawPublic.replace(/^\/+/, "")}`).replace(/\\/g, "/")
    : (relativeDisk ? `/${relativeDisk}` : "");

  if (finalPublicUrl && masterPreview) {
    masterPreview.src = finalPublicUrl;
  }

  if (ytVideoPath) {
    const fieldValue = relativeDisk || (finalPublicUrl ? finalPublicUrl.replace(/^\/+/, "") : "");
    if (fieldValue) {
      ytVideoPath.value = fieldValue;
    }
  }
}

if (masterBuildBtn) {
  masterBuildBtn.addEventListener("click", async () => {
    if (masterIsBuilding) return;

    initMasterProgressUI();

    if (masterPreview) masterPreview.removeAttribute("src");
    if (masterResult) masterResult.textContent = "Starting master build...";
    masterLastPct = 0;
    setMasterProgressUI(0, "Starting");
    masterIsBuilding = true;

    const loop_path = masterLoopPath ? masterLoopPath.value.trim() : "";
    const song_path = masterSongPath ? masterSongPath.value.trim() : "";
    const vo_path = masterVOPath ? masterVOPath.value.trim() : "";

    let durationSecondsCandidate = Number.isFinite(lastMusicDurationSeconds) && lastMusicDurationSeconds > 0
      ? lastMusicDurationSeconds
      : NaN;

    if (!Number.isFinite(durationSecondsCandidate) || durationSecondsCandidate <= 0) {
      const parsedMusicValue = musicDuration ? parseInt(musicDuration.value, 10) : NaN;
      if (!Number.isNaN(parsedMusicValue) && parsedMusicValue > 0) {
        durationSecondsCandidate = parsedMusicValue;
      }
    }

    if (!Number.isFinite(durationSecondsCandidate) || durationSecondsCandidate <= 0) {
      const parsedVideoValue = videoDuration ? parseInt(videoDuration.value, 10) : NaN;
      if (!Number.isNaN(parsedVideoValue) && parsedVideoValue > 0) {
        durationSecondsCandidate = parsedVideoValue;
      }
    }

    if (!Number.isFinite(durationSecondsCandidate) || durationSecondsCandidate <= 0) {
      durationSecondsCandidate = lastVideoDurationSeconds && lastVideoDurationSeconds > 0
        ? lastVideoDurationSeconds
        : 180;
    }

    const durationMs = Math.max(1000, Math.round(durationSecondsCandidate * 1000));
    const outNameBase = `master_${Date.now()}`;

    const body = {
      loop_path,
      song_path,
      duration_ms: durationMs,
      out_name: outNameBase,
    };
    if (vo_path) {
      body.voiceover_path = vo_path;
    }

    setMasterProgressUI(35, "Mixing");

    const resp = await postJSON("/package/master", body);

    if (masterResult) {
      masterResult.textContent = JSON.stringify(resp.data, null, 2);
    }

    if (!resp.ok) {
      restoreMasterButtonUI("Error", true);
      const detail = resp.data && resp.data.detail;
      const msg = detail
        ? (typeof detail === "string" ? detail : JSON.stringify(detail, null, 2))
        : ("Request failed with status " + resp.status);
      if (masterResult) {
        masterResult.textContent = "Error:\n" + msg;
      }
      return;
    }

    if (resp.data) {
      setMasterProgressUI(80, "Finalizing");
      setMasterProgressUI(100, "Done");
      applyMasterVideo(resp.data);
    }

    setTimeout(() => restoreMasterButtonUI(null, false), 400);
  });
}

// =========================
// PUBLISH TAB: YOUTUBE
// =========================
const ytUploadBtn = document.getElementById("ytUploadBtn");
const ytTitle = document.getElementById("ytTitle");
const ytDesc = document.getElementById("ytDesc");
const ytTags = document.getElementById("ytTags");
const ytResult = document.getElementById("ytResult");
const ytVisibility = document.getElementById("ytVisibility");
const ytPublishDate = document.getElementById("ytPublishDate");
const ytPublishTime = document.getElementById("ytPublishTime");
const ytScheduleHint = document.getElementById("ytScheduleHint");

function syncYTScheduleState() {
  if (!ytVisibility) return;
  const isPublic = (ytVisibility.value || "").toLowerCase() === "public";
  const controls = [ytPublishDate, ytPublishTime].filter(Boolean);
  controls.forEach(el => {
    el.disabled = !isPublic;
    if (!isPublic) {
      el.value = "";
    }
  });

  if (isPublic && ytPublishDate) {
    const today = new Date();
    const isoDate = today.toISOString().split("T")[0];
    ytPublishDate.min = isoDate;
  }

  if (!isPublic) {
    if (ytScheduleHint) {
      ytScheduleHint.textContent = "Scheduling is available only when visibility is Public.";
    }
  } else if (ytScheduleHint) {
    ytScheduleHint.textContent = "Pick a future date and time to automatically go live.";
  }
}

if (ytVisibility) {
  ytVisibility.addEventListener("change", syncYTScheduleState);
  syncYTScheduleState();
}

if (ytUploadBtn) {
  ytUploadBtn.addEventListener("click", async () => {
    await withButtonWorkingState(ytUploadBtn, async () => {
      ytResult.textContent = "Uploading to YouTube...";

      const visibility = ytVisibility ? ytVisibility.value.trim().toLowerCase() : "unlisted";
      const videoPathValue = ytVideoPath ? ytVideoPath.value.trim() : "";
      const dateValue = ytPublishDate && !ytPublishDate.disabled ? ytPublishDate.value : "";
      const timeValue = ytPublishTime && !ytPublishTime.disabled ? ytPublishTime.value : "";

      if (dateValue && !timeValue) {
        ytResult.textContent = "Please choose a time or clear the scheduled date.";
        return;
      }

      if (timeValue && !dateValue) {
        ytResult.textContent = "Please choose a date or clear the scheduled time.";
        return;
      }

      let publishAtIso = null;
      if (dateValue && timeValue) {
        const combined = new Date(`${dateValue}T${timeValue}`);
        if (Number.isNaN(combined.getTime())) {
          ytResult.textContent = "Unable to parse the scheduled date/time. Please adjust and try again.";
          return;
        }
        publishAtIso = combined.toISOString();
      }

      const body = {
        video_path: videoPathValue,
        title: ytTitle.value.trim(),
        description: ytDesc.value.trim(),
        tags: ytTags.value.split(",").map(t => t.trim()).filter(Boolean),
        privacy_status: visibility,
        publish_at: publishAtIso,
      };

      const resp = await postJSON("/youtube/upload", body);

      ytResult.textContent = JSON.stringify(resp.data, null, 2);
    });
  });
}
