// Dashboard + job status view logic.
import { formatRelativeTime } from './common.js';

export function applyDashboardIdentity(state, opts = {}) {
  const nameRaw = (opts.name || '').toString().trim();
  const name = nameRaw || 'Creator';
  const roleRaw = (opts.role || '').toString();
  const role = roleRaw && roleRaw.length ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1) : 'Viewer';
  const workspace = opts.workspace || state?.workspace || 'Default';
  const avatarInitial = (name.match(/[A-Za-z]/)?.[0] || name.charAt(0) || 'C').toUpperCase();

  const welcome = document.getElementById('dashboardWelcome');
  if (welcome) {
    welcome.textContent = opts.isSignedIn ? `Welcome back, ${name}` : 'Welcome to Creator Toolkit';
  }
  const subhead = document.getElementById('dashboardSubhead');
  if (subhead) {
    subhead.textContent = opts.isSignedIn
      ? 'Here’s an overview of your recent activity and provider status.'
      : 'Sign in to access your workspace overview and connected providers.';
  }
  const info = document.getElementById('dashboardInfo');
  if (info) info.classList.toggle('hidden', !!opts.isSignedIn);
  const accountName = document.getElementById('dashboardAccountName');
  if (accountName) accountName.textContent = opts.isSignedIn ? name : 'Signed out';
  const avatar = document.getElementById('dashboardAvatar');
  if (avatar) avatar.textContent = avatarInitial;

  const roleTargets = [
    document.getElementById('dashboardRoleBadge'),
    document.getElementById('dashboardRoleBadgeSecondary'),
  ].filter(Boolean);
  roleTargets.forEach((el) => {
    el.textContent = role;
  });

  const wsTargets = [
    document.getElementById('dashboardWorkspaceBadge'),
    document.getElementById('dashboardWorkspaceBadgeSecondary'),
  ].filter(Boolean);
  wsTargets.forEach((el) => {
    el.textContent = `Workspace: ${workspace}`;
  });
}

export async function initDashboard(containerEl, { state } = {}) {
  const view = document.getElementById('dashboard-view');
  if (!view || !state) return;
  if (!view.dataset.initialized) {
    const refreshBtn = document.getElementById('refreshJobsButton');
    refreshBtn?.addEventListener('click', () => hydrateDashboard(state));
    view.dataset.initialized = 'true';
  }
  await hydrateDashboard(state);
}

export async function hydrateDashboard(state) {
  const r = await fetch('/dashboard/data', { credentials: 'include' });
  if (!r.ok) return;
  const data = await r.json();
  const roleRaw = (data.user?.role || '').toString();
  const role = roleRaw ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1) : 'Viewer';
  applyDashboardIdentity(state, {
    name: data.user?.display_name || data.user?.email || 'Creator',
    role,
    workspace: state?.workspace,
    isSignedIn: true,
  });

  const grid = document.getElementById('dashboardProviders');
  const providers = data.providers || {};
  if (grid) {
    grid.innerHTML = '';
    ['openai', 'elevenlabs', 'youtube'].forEach((key) => {
      const status = (providers[key] || 'missing').toString();
      const row = document.createElement('div');
      row.className = 'status-row';
      const label = document.createElement('span');
      let friendly = key;
      if (key === 'openai') friendly = 'OpenAI';
      else if (key === 'elevenlabs') friendly = 'ElevenLabs';
      else if (key === 'youtube') friendly = 'YouTube';
      label.textContent = friendly;
      const pill = document.createElement('span');
      pill.className = `status-pill ${status === 'connected' ? 'connected' : 'missing'}`;
      pill.textContent = status === 'connected' ? 'Connected' : 'Missing';
      row.appendChild(label);
      row.appendChild(pill);
      grid.appendChild(row);
    });
  }

  const list = document.getElementById('dashboardProfileList');
  if (list) {
    list.innerHTML = '';
    const pairs = [
      ['Name', data.user?.display_name || '—'],
      ['Email', data.user?.email || '—'],
      ['Access', data.user?.access_group || '—'],
    ];
    pairs.forEach(([k, v]) => {
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
        const progress = typeof job.progress === 'number' ? `${job.progress}%` : '';
        const updated = formatRelativeTime(job.updated_at) || job.updated_at || '';
        meta.textContent = [status, stage, progress, updated].filter(Boolean).join(' • ');
        row.appendChild(title);
        row.appendChild(meta);
        activeJobsList.appendChild(row);
      });
    }
  }

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
          const progress = typeof job.progress === 'number' ? `${job.progress}%` : '—';
          const updated = formatRelativeTime(job.updated_at) || job.updated_at || '—';
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
        primary.textContent = asset.label || asset.title || asset.path || asset.id || 'Asset';
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
