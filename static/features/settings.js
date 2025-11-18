// Settings and admin user management panels.
import { formatRelativeTime, readErrorMessage, toast } from './common.js';

const DEFAULT_ADMIN_ROLES = ['admin', 'owner', 'editor', 'viewer'];
const DEFAULT_WORKSPACES = ['Default'];

const adminUsersState = {
  initialized: false,
  loading: false,
  list: [],
  roles: DEFAULT_ADMIN_ROLES.slice(),
  workspaces: DEFAULT_WORKSPACES.slice(),
  search: '',
  selected: null,
};

let appStateRef = null;

function isCurrentUserAdmin() {
  return (appStateRef?.user?.role || '').toLowerCase() === 'admin';
}

export async function initSettingsPanels(_containerEl, { state } = {}) {
  appStateRef = state || appStateRef;
  hydrateSettingsPanels();
}

function hydrateSettingsPanels() {
  const usersSection = document.getElementById('settings-users');
  const tabButtons = document.querySelectorAll('.ct-tab[data-view="settings-users"]');
  const isAdmin = isCurrentUserAdmin();
  tabButtons.forEach((btn) => {
    if (isAdmin) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
  });
  if (!usersSection) return;
  if (!isAdmin) {
    usersSection.classList.add('hidden');
    document.getElementById('adminUsersPanel')?.classList.add('hidden');
    document.getElementById('adminUsersRestricted')?.classList.remove('hidden');
    return;
  }
  usersSection.classList.remove('hidden');
  document.getElementById('adminUsersRestricted')?.classList.add('hidden');
  document.getElementById('adminUsersPanel')?.classList.remove('hidden');
  initAdminUsersPanel().catch(() => {});
}

async function initAdminUsersPanel() {
  if (!isCurrentUserAdmin()) return;
  const panel = document.getElementById('adminUsersPanel');
  if (!panel) return;
  if (!adminUsersState.initialized) {
    adminUsersState.initialized = true;
    const tbody = document.getElementById('adminUsersTableBody');
    tbody?.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-user-id]');
      if (!row) return;
      const id = Number(row.getAttribute('data-user-id'));
      if (id) {
        event.preventDefault();
        selectAdminUser(id);
      }
    });
    const searchForm = document.getElementById('adminUsersSearchForm');
    searchForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const term = (document.getElementById('adminUsersSearchInput')?.value || '').trim();
      adminUsersState.search = term;
      refreshAdminUsersList(term);
    });
    document.getElementById('adminUsersRefreshBtn')?.addEventListener('click', () => {
      refreshAdminUsersList(adminUsersState.search);
    });
    document.getElementById('adminUsersCreateToggle')?.addEventListener('click', () =>
      toggleCreateUserCard(true)
    );
    document.getElementById('adminCreateCancel')?.addEventListener('click', () =>
      toggleCreateUserCard(false)
    );
    document.getElementById('adminCreateGeneratePassword')?.addEventListener('change', (event) => {
      const checked = event.target.checked;
      const field = document.getElementById('adminCreatePasswordField');
      const input = document.getElementById('adminCreatePassword');
      if (field) field.classList.toggle('hidden', checked);
      if (input) {
        input.disabled = checked;
        if (checked) input.value = '';
      }
    });
    document.getElementById('adminCreateUserForm')?.addEventListener('submit', handleAdminCreateUser);
    document.getElementById('adminUserDetailForm')?.addEventListener('submit', handleAdminUserUpdate);
    document
      .getElementById('adminUserPasswordForm')
      ?.addEventListener('submit', handleAdminUserPasswordChange);
    populateAdminRoleOptions();
    applyAdminWorkspaceOptions();
    await refreshAdminWorkspaceOptions();
  }
  await refreshAdminUsersList(adminUsersState.search);
}

async function refreshAdminUsersList(query) {
  if (!isCurrentUserAdmin()) return;
  const tbody = document.getElementById('adminUsersTableBody');
  if (!tbody) return;
  adminUsersState.loading = true;
  const params = query ? `?q=${encodeURIComponent(query)}` : '';
  try {
    const resp = await fetch(`/admin/users${params}`, { credentials: 'include' });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp, 'Unable to load users'));
    }
    const data = await resp.json();
    adminUsersState.list = Array.isArray(data.users) ? data.users : [];
    const roles =
      Array.isArray(data.roles) && data.roles.length ? data.roles : DEFAULT_ADMIN_ROLES.slice();
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
      document.getElementById('adminUserDetailForm')?.classList.add('hidden');
      document.getElementById('adminUserPasswordForm')?.classList.add('hidden');
      document.getElementById('adminUserDetailPlaceholder')?.classList.remove('hidden');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="dashboard-placeholder">${err.message || 'Unable to load users'}</td></tr>`;
    toast(err.message || 'Unable to load users', { type: 'error' });
  } finally {
    adminUsersState.loading = false;
  }
}

function renderAdminUsersTable() {
  const tbody = document.getElementById('adminUsersTableBody');
  if (!tbody) return;
  const users = adminUsersState.list || [];
  if (!users.length) {
    const message = adminUsersState.loading ? 'Loading users…' : 'No users found.';
    tbody.innerHTML = `<tr><td colspan="6" class="dashboard-placeholder">${message}</td></tr>`;
    return;
  }
  tbody.innerHTML = users
    .map((user) => {
      const isSelected = adminUsersState.selected?.id === user.id;
      const status = user.is_active ? 'Active' : 'Inactive';
      const statusClass = user.is_active ? '' : 'inactive';
      return `
          <tr data-user-id="${user.id}" class="${isSelected ? 'active' : ''}">
            <td>${user.full_name || '—'}</td>
            <td>${user.email || '—'}</td>
            <td>${formatRoleLabel(user.role)}</td>
            <td><span class="status-pill ${statusClass}">${status}</span></td>
            <td>${formatRelativeTime(user.created_at) || '—'}</td>
            <td>${formatRelativeTime(user.last_login_at) || '—'}</td>
          </tr>`;
    })
    .join('');
}

function formatRoleLabel(role) {
  if (!role) return 'Viewer';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

async function selectAdminUser(userId, opts = {}) {
  if (!userId || !isCurrentUserAdmin()) return;
  const tbody = document.getElementById('adminUsersTableBody');
  if (tbody) {
    tbody.querySelectorAll('tr.active').forEach((row) => row.classList.remove('active'));
    const activeRow = tbody.querySelector(`tr[data-user-id="${userId}"]`);
    activeRow?.classList.add('active');
  }
  try {
    let user = opts.user;
    if (!opts.skipFetch) {
      const resp = await fetch(`/admin/users/${userId}`, { credentials: 'include' });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, 'Unable to load user'));
      }
      const data = await resp.json();
      user = data.user;
    }
    if (!user) return;
    adminUsersState.selected = user;
    populateAdminUserDetail(user);
  } catch (err) {
    const feedback = document.getElementById('adminUserDetailFeedback');
    if (feedback) feedback.textContent = err.message || 'Unable to load user';
    toast(err.message || 'Unable to load user', { type: 'error' });
  }
}

function populateAdminUserDetail(user) {
  const placeholder = document.getElementById('adminUserDetailPlaceholder');
  const form = document.getElementById('adminUserDetailForm');
  const passForm = document.getElementById('adminUserPasswordForm');
  if (!form) return;
  placeholder?.classList.add('hidden');
  form.classList.remove('hidden');
  passForm?.classList.remove('hidden');
  document.getElementById('adminUserDetailId').value = user.id;
  document.getElementById('adminUserDetailName').value = user.full_name || '';
  document.getElementById('adminUserDetailEmail').value = user.email || '';
  populateAdminRoleOptions();
  applyAdminWorkspaceOptions();
  const roleSelect = document.getElementById('adminUserDetailRole');
  if (roleSelect && user.role) roleSelect.value = user.role;
  const workspaceSelect = document.getElementById('adminUserDetailWorkspace');
  if (workspaceSelect && user.workspace) workspaceSelect.value = user.workspace;
  const activeToggle = document.getElementById('adminUserDetailActive');
  if (activeToggle) activeToggle.checked = Boolean(user.is_active);
  document.getElementById('adminUserDetailFeedback').textContent = '';
  document.getElementById('adminUserPasswordFeedback').textContent = '';
}

function populateAdminRoleOptions() {
  const roles = adminUsersState.roles;
  if (!roles || !roles.length) return;
  const selects = [
    document.getElementById('adminUserDetailRole'),
    document.getElementById('adminCreateRole'),
  ];
  selects.forEach((select) => {
    if (!select) return;
    const current = select.value;
    select.innerHTML = roles.map((role) => `<option value="${role}">${formatRoleLabel(role)}</option>`).join('');
    if (current && roles.includes(current)) {
      select.value = current;
    }
  });
}

async function refreshAdminWorkspaceOptions() {
  if (!isCurrentUserAdmin()) return;
  try {
    const resp = await fetch('/api/workspaces');
    if (resp.ok) {
      const data = await resp.json();
      adminUsersState.workspaces =
        Array.isArray(data.items) && data.items.length ? data.items : DEFAULT_WORKSPACES.slice();
    } else {
      adminUsersState.workspaces = DEFAULT_WORKSPACES.slice();
    }
  } catch {
    adminUsersState.workspaces = DEFAULT_WORKSPACES.slice();
  }
  applyAdminWorkspaceOptions();
}

function applyAdminWorkspaceOptions() {
  const workspaces =
    adminUsersState.workspaces && adminUsersState.workspaces.length
      ? adminUsersState.workspaces
      : DEFAULT_WORKSPACES.slice();
  const selects = [
    document.getElementById('adminUserDetailWorkspace'),
    document.getElementById('adminCreateWorkspace'),
  ];
  selects.forEach((select) => {
    if (!select) return;
    const current = select.value;
    select.innerHTML = workspaces.map((name) => `<option value="${name}">${name}</option>`).join('');
    if (current && workspaces.includes(current)) {
      select.value = current;
    }
  });
}

async function handleAdminUserUpdate(event) {
  event.preventDefault();
  if (!isCurrentUserAdmin()) return;
  const id = Number(document.getElementById('adminUserDetailId').value);
  if (!id) return;
  const payload = {
    full_name: document.getElementById('adminUserDetailName').value.trim(),
    email: document.getElementById('adminUserDetailEmail').value.trim(),
    role: document.getElementById('adminUserDetailRole').value,
    workspace: document.getElementById('adminUserDetailWorkspace').value,
    is_active: document.getElementById('adminUserDetailActive').checked,
  };
  const feedback = document.getElementById('adminUserDetailFeedback');
  feedback.textContent = '';
  try {
    const resp = await fetch(`/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp, 'Unable to update user'));
    }
    const data = await resp.json();
    adminUsersState.selected = data.user;
    feedback.textContent = 'Changes saved.';
    toast('User updated', { type: 'success' });
    await refreshAdminUsersList(adminUsersState.search);
  } catch (err) {
    feedback.textContent = err.message || 'Unable to update user';
    toast(err.message || 'Unable to update user', { type: 'error' });
  }
}

async function handleAdminUserPasswordChange(event) {
  event.preventDefault();
  if (!isCurrentUserAdmin()) return;
  const id = Number(document.getElementById('adminUserDetailId').value);
  if (!id) return;
  const password = document.getElementById('adminUserPassword')?.value || '';
  const confirm = document.getElementById('adminUserPasswordConfirm')?.value || '';
  const feedback = document.getElementById('adminUserPasswordFeedback');
  feedback.textContent = '';
  if (!password || password.length < 8) {
    feedback.textContent = 'Password must be at least 8 characters.';
    return;
  }
  if (password !== confirm) {
    feedback.textContent = 'Passwords do not match.';
    return;
  }
  try {
    const resp = await fetch(`/admin/users/${id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password, confirm_password: confirm }),
    });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp, 'Unable to update password'));
    }
    feedback.textContent = 'Password updated.';
    const passInput = document.getElementById('adminUserPassword');
    const confirmInput = document.getElementById('adminUserPasswordConfirm');
    if (passInput) passInput.value = '';
    if (confirmInput) confirmInput.value = '';
    toast('Password updated', { type: 'success' });
  } catch (err) {
    feedback.textContent = err.message || 'Unable to update password';
    toast(err.message || 'Unable to update password', { type: 'error' });
  }
}

async function handleAdminCreateUser(event) {
  event.preventDefault();
  if (!isCurrentUserAdmin()) return;
  const nameInput = document.getElementById('adminCreateFullName');
  const emailInput = document.getElementById('adminCreateEmail');
  const roleSelect = document.getElementById('adminCreateRole');
  const workspaceSelect = document.getElementById('adminCreateWorkspace');
  const passwordInput = document.getElementById('adminCreatePassword');
  const autoPassword = document.getElementById('adminCreateGeneratePassword');
  const feedback = document.getElementById('adminCreateUserFeedback');
  const resultPanel = document.getElementById('adminCreatePasswordResult');
  const resultText = document.getElementById('adminCreatePasswordText');
  feedback.textContent = '';
  resultPanel?.classList.add('hidden');
  const payload = {
    full_name: nameInput?.value?.trim() || '',
    email: emailInput?.value?.trim() || '',
    role: roleSelect?.value || 'viewer',
    workspace: workspaceSelect?.value || 'Default',
    password: autoPassword?.checked ? null : passwordInput?.value || '',
    generate_password: Boolean(autoPassword?.checked),
  };
  if (!payload.full_name || !payload.email) {
    feedback.textContent = 'Name and email are required.';
    return;
  }
  if (!payload.generate_password && (!payload.password || payload.password.length < 8)) {
    feedback.textContent = 'Password must be at least 8 characters.';
    return;
  }
  try {
    const resp = await fetch('/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp, 'Unable to create user'));
    }
    const data = await resp.json();
    toast('User created', { type: 'success' });
    if (resultPanel && resultText && data.generated_password) {
      resultText.textContent = `Generated password: ${data.generated_password}`;
      resultPanel.classList.remove('hidden');
    }
    event.target.reset();
    if (passwordInput) passwordInput.value = '';
    autoPassword.checked = false;
    document.getElementById('adminCreatePasswordField')?.classList.remove('hidden');
    toggleCreateUserCard(false);
    await refreshAdminUsersList(adminUsersState.search);
    if (data.user?.id) {
      selectAdminUser(data.user.id, { skipFetch: true, user: data.user });
    }
  } catch (err) {
    feedback.textContent = err.message || 'Unable to create user';
    toast(err.message || 'Unable to create user', { type: 'error' });
  }
}

function toggleCreateUserCard(show) {
  const card = document.getElementById('adminCreateUserCard');
  if (!card) return;
  if (show) {
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
    const feedback = document.getElementById('adminCreateUserFeedback');
    if (feedback) feedback.textContent = '';
    document.getElementById('adminCreatePasswordResult')?.classList.add('hidden');
  }
}
