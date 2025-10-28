// =========================
// Authentication / UI state
// =========================
const STORAGE_TOKEN_KEY = "jwtToken";
const authState = {
  token: null,
  user: null,
};

const authOverlay = document.getElementById("authOverlay");
const authTabs = authOverlay ? Array.from(authOverlay.querySelectorAll(".modal-tab")) : [];
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authFeedback = document.getElementById("authFeedback");

const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const registerNameInput = document.getElementById("registerName");
const registerEmailInput = document.getElementById("registerEmail");
const registerPasswordInput = document.getElementById("registerPassword");

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
const profileAccessGroupLabel = document.getElementById("profileAccessGroup");

const passwordForm = document.getElementById("passwordForm");
const currentPasswordInput = document.getElementById("currentPassword");
const newPasswordInput = document.getElementById("newPassword");
const passwordFormFeedback = document.getElementById("passwordFormFeedback");

const accessGroupForm = document.getElementById("accessGroupForm");
const accessGroupSelect = document.getElementById("accessGroupSelect");
const accessGroupFeedback = document.getElementById("accessGroupFeedback");

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

const protectedControls = [
  document.getElementById("imagineSendBtn"),
  document.getElementById("musicGenerateBtn"),
  document.getElementById("videoGenerateBtn"),
  document.getElementById("masterBuildBtn"),
  document.getElementById("ytUploadBtn"),
];

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
  if (loginForm) loginForm.classList.toggle("active", mode === "login");
  if (registerForm) registerForm.classList.toggle("active", mode === "register");
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
  setFeedback(accessGroupFeedback, "");
  setFeedback(apiKeysFeedback, "");
  syncModalOpenState();
  loadApiKeys();
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

function updateProtectedUI(locked) {
  protectedControls.forEach(btn => {
    if (!btn) return;
    if (locked) {
      btn.dataset.locked = "1";
      btn.disabled = true;
      btn.title = "Verify your email to use this feature";
    } else if (btn.dataset.locked === "1") {
      delete btn.dataset.locked;
      btn.removeAttribute("title");
      if (!btn.classList.contains("busy")) {
        btn.disabled = false;
      }
    }
  });
}

function applyUserState() {
  const user = authState.user;
  if (!user) {
    if (userActions) userActions.classList.add("hidden");
    if (docsLink) docsLink.classList.add("hidden");
    document.body.classList.remove("dev-mode");
    updateProtectedUI(true);
    if (verificationBanner) verificationBanner.classList.add("hidden");
    return;
  }
  if (userActions) userActions.classList.remove("hidden");
  if (userGreeting) {
    const firstName = user.full_name ? user.full_name.split(" ")[0] : user.email;
    userGreeting.textContent = firstName ? `Hi, ${firstName}` : "";
  }
  const group = user.access_group || "User";
  document.body.classList.toggle("dev-mode", group === "Dev");
  if (docsLink) docsLink.classList.toggle("hidden", group !== "Dev");
  const verified = !!user.is_verified;
  updateProtectedUI(!verified);
  if (verificationBanner) verificationBanner.classList.toggle("hidden", verified);
  if (verified) {
    hideVerificationOverlay();
  }
  populateProfileSummary();
}

function populateProfileSummary() {
  const user = authState.user;
  if (!user) return;
  if (profileVerificationStatus) {
    profileVerificationStatus.textContent = user.is_verified ? "Email verified" : "Verification required";
  }
  if (profileAccessGroupLabel) {
    profileAccessGroupLabel.textContent = `Access Group: ${user.access_group || "User"}`;
  }
  if (accessGroupSelect) {
    accessGroupSelect.value = user.access_group || "User";
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
    return;
  }
  if (!authState.user.is_verified) {
    apiKeysList.innerHTML = '<p class="help-text">Verify your email to manage API keys.</p>';
    return;
  }
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
    });
    item.appendChild(nameSpan);
    item.appendChild(removeBtn);
    apiKeysList.appendChild(item);
  });
}

authTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setActiveAuthMode(tab.dataset.mode || "login");
  });
});

if (loginForm) {
  loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!loginEmailInput || !loginPasswordInput) return;
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();
    const submitBtn = loginForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/auth/login", { email, password }, { skipAuthRedirect: true });
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Login failed.";
        setFeedback(authFeedback, msg, "error");
        return;
      }
      const { token, user, requires_verification } = resp.data || {};
      if (!token || !user) {
        setFeedback(authFeedback, "Unexpected login response.", "error");
        return;
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
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!registerNameInput || !registerEmailInput || !registerPasswordInput) return;
    const payload = {
      full_name: registerNameInput.value.trim(),
      email: registerEmailInput.value.trim(),
      password: registerPasswordInput.value.trim(),
    };
    const submitBtn = registerForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/auth/register", payload, { skipAuthRedirect: true });
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Registration failed.";
        setFeedback(authFeedback, msg, "error");
        return;
      }
      const message = resp.data && resp.data.message ? resp.data.message : "Account created. Log in to continue.";
      const emailSent = resp.data && Object.prototype.hasOwnProperty.call(resp.data, "email_sent") ? !!resp.data.email_sent : true;
      setActiveAuthMode("login");
      setFeedback(authFeedback, message, emailSent ? "success" : "error");
    });
  });
}

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
      setFeedback(passwordFormFeedback, "Password updated.", "success");
    });
  });
}

if (accessGroupForm) {
  accessGroupForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!accessGroupSelect) return;
    const value = accessGroupSelect.value;
    const submitBtn = accessGroupForm.querySelector("button[type='submit']");
    await withButtonWorkingState(submitBtn, async () => {
      const resp = await postJSON("/profile/access-group", { access_group: value });
      if (!resp.ok) {
        const msg = resp.data && (resp.data.error || resp.data.detail) ? (resp.data.error || resp.data.detail) : "Failed to update access group.";
        setFeedback(accessGroupFeedback, msg, "error");
        return;
      }
      if (resp.data && resp.data.user) {
        authState.user = resp.data.user;
        applyUserState();
      } else {
        await refreshSession();
      }
      setFeedback(accessGroupFeedback, `Access group set to ${value}.`, "success");
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
    });
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
  if (userActions) userActions.classList.add("hidden");
  updateProtectedUI(true);
  try {
    const stored = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (stored) {
      authState.token = stored;
    }
  } catch (err) {
    console.warn("could not restore token", err);
  }
  refreshSession().then(() => {
    if (!authState.user) {
      showAuthOverlay("login");
    }
  });
}

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
