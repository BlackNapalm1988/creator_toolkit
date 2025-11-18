// Sora text-to-video create flow and supporting library utilities.
import { readErrorMessage, toast } from './common.js';

const INIT_FLAG = 'data-sora-init';

function updateVideoStatus(state, info = {}) {
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
    metaText = jobId ? `Status: ${status}. Job ${jobId}.` : `Status: ${status}.`;
    cls = 'video-status-pill video-status-pill--active';
  }

  pill.textContent = label;
  pill.className = cls;
  meta.textContent = metaText;

  if (state && state.videoJob) {
    state.videoJob.id = jobId;
    state.videoJob.status = status;
  }
}

async function pollVideoJob(state, ids, helpers) {
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
        ? `job_id=${encodeURIComponent(providerId)}&backend_job_id=${encodeURIComponent(backendId)}`
        : `job_id=${encodeURIComponent(providerId)}`;
      resp = await fetch(`/generate/video/status?${qp}`, {
        credentials: 'include',
      });
    } catch {
      updateVideoStatus(state, {
        state: 'error',
        jobId: backendId,
        message: 'Unable to reach status endpoint.',
      });
      return;
    }
    if (!resp.ok) {
      const msg = await readErrorMessage(resp, 'Unable to check video status');
      updateVideoStatus(state, { state: 'error', jobId: backendId, message: msg });
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
      updateVideoStatus(state, { state: status, jobId: backendId, progress: data.progress });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (status === 'ready') {
      const loopPath = data.loop_path || '';
      updateVideoStatus(state, { state: 'ready', jobId: backendId, progress: 100 });
      if (loopPath) {
        const previewEl = document.getElementById('videoPreview');
        const cleanPath = String(loopPath).replace(/^\/+/, '');
        if (previewEl) previewEl.setAttribute('src', `/${cleanPath}`);
      }
      try {
        helpers.fetchLibrary?.('video');
      } catch {}
      try {
        await helpers.hydrateCreateModuleLists?.();
      } catch {}
      toast('Video ready', { type: 'success' });
      return;
    }
    if (status === 'failed') {
      updateVideoStatus(state, {
        state: 'failed',
        jobId: backendId,
        message: data.error || data.detail,
      });
      toast('Video generation failed', { type: 'error' });
      return;
    }
    updateVideoStatus(state, { state: status, jobId: backendId });
    return;
  }
  updateVideoStatus(state, {
    state: 'error',
    jobId: backendId,
    message: 'Timed out waiting for Sora.',
  });
  toast('Timed out waiting for video to finish.', { type: 'error' });
}

function setupSeedAndRemixControls() {
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

  return { seedInput, seedLock, remixControls, remixRadios };
}

function wireSceneSelection(remixControls) {
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
    const label = job.out_path ? String(job.out_path).split('/').slice(-1)[0] : job.id || 'job';
    btn.textContent = label;
    btn.setAttribute('data-path', job.out_path || '');
    btn.setAttribute('data-kind', kind);
    btn.title = `${job.type || 'job'} • ${job.status || ''}`.trim();
    container.appendChild(btn);
  });
}

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

export async function hydrateCreateModuleLists() {
  const jobs = await fetchRecentJobs();
  const mp4Jobs = jobs.filter((j) => (j.out_path || '').toLowerCase().endsWith('.mp4'));
  const mp3Jobs = jobs.filter((j) => (j.out_path || '').toLowerCase().endsWith('.mp3'));

  renderList(document.getElementById('videoScenesList'), mp4Jobs, { kind: 'video' });
  renderList(document.getElementById('musicTracksList'), mp3Jobs, { kind: 'audio' });
  renderList(document.getElementById('masterAssetsList'), mp4Jobs, { kind: 'master' });

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

function buildLibraryFetcher(state) {
  const libraryGrid = document.getElementById('libraryGrid');
  const libraryTabs = Array.from(document.querySelectorAll('.library-tab'));
  const renderLibraryPlaceholder = (text) => {
    if (libraryGrid) libraryGrid.innerHTML = `<div class="dashboard-placeholder">${text}</div>`;
  };

  const fetchLibrary = (type) => {
    if (!libraryGrid) return;
    if (!state?.user) {
      renderLibraryPlaceholder('Sign in to load your library.');
      return;
    }
    renderLibraryPlaceholder('Loading your library...');
    const qp = type ? `?asset_type=${encodeURIComponent(type)}` : '';
    fetch(`/library${qp}`, { credentials: 'include' })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (!data?.items || data.items.length === 0) {
          renderLibraryPlaceholder('No assets found yet.');
          return;
        }
        const cards = data.items
          .map((item) => {
            const src = item.path ? `/${item.path.replace(/^\\/+/, '')}` : '#';
            const cap = item.label || item.title || item.path || item.id || 'Asset';
            const typeLabel = item.type || item.asset_type || '';
            return `
              <article class="library-card">
                <header class="library-card__meta">
                  <div class="pill-subtle">${typeLabel || 'Asset'}</div>
                  <div class="library-card__path">${item.path || ''}</div>
                </header>
                <div class="library-card__body">
                  ${item.thumbnail ? `<img src="${item.thumbnail}" alt="${cap}" />` : ''}
                  <div class="library-card__title">${cap}</div>
                </div>
                <footer class="library-card__footer">
                  <a href="${src}" target="_blank" rel="noopener" class="ghost-btn small subtle">Open</a>
                </footer>
              </article>
            `;
          })
          .join('');
        libraryGrid.innerHTML = cards || '<div class="dashboard-placeholder">No assets found.</div>';
      })
      .catch(() => renderLibraryPlaceholder('Unable to load your library.'));
  };

  libraryTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-asset-type') || '';
      libraryTabs.forEach((b) => b.classList.toggle('active', b === btn));
      fetchLibrary(next);
    });
  });

  return fetchLibrary;
}

export async function initLibraryView(_containerEl, { state } = {}) {
  const view = document.getElementById('library-view');
  if (!view) return;
  if (view.dataset.initialized) return;
  const fetchLibrary = buildLibraryFetcher(state || {});
  fetchLibrary('');
  view.dataset.initialized = 'true';
}

export async function initSoraPanel(_containerEl, { state } = {}) {
  const view = document.getElementById('create-video-view');
  if (!view || !state) return;
  const { seedInput, seedLock, remixControls, remixRadios } = setupSeedAndRemixControls();
  wireSceneSelection(remixControls);
  if (!view.getAttribute(INIT_FLAG)) {
    view.setAttribute(INIT_FLAG, 'true');
    const videoGenerateBtn = document.getElementById('videoGenerateBtn');
    const fetchLibrary = buildLibraryFetcher(state);
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
        updateVideoStatus(state, { state: 'starting' });
        try {
          const resp = await fetch('/generate/video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          if (!resp.ok) {
            const message = await readErrorMessage(resp, 'Generation failed');
            updateVideoStatus(state, { state: 'failed', message });
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
            updateVideoStatus(state, { state: 'failed', message });
            throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
          }
          const status = (data.status || '').toString() || 'unknown';
          const backendJobId = data.job_id || null;
          const providerJobId = data.provider_job_id || null;
          const loopPath = data.loop_path || null;
          if (loopPath) {
            const previewEl = document.getElementById('videoPreview');
            const cleanPath = String(loopPath).replace(/^\\/+/, '');
            if (previewEl) previewEl.setAttribute('src', `/${cleanPath}`);
          }
          if (
            backendJobId &&
            (status === 'queued' ||
              status === 'processing' ||
              status === 'running' ||
              status === 'completed')
          ) {
            updateVideoStatus(state, {
              state: status,
              jobId: backendJobId,
              progress: data.progress,
            });
            pollVideoJob(state, { backendId: backendJobId, providerId: providerJobId || null }, {
              fetchLibrary,
              hydrateCreateModuleLists,
            });
          } else if (status === 'ready' || loopPath) {
            updateVideoStatus(state, {
              state: 'ready',
              jobId: backendJobId,
              progress: 100,
            });
          } else {
            updateVideoStatus(state, { state: status, jobId: backendJobId });
          }
          toast('Video generation started', { type: 'success' });
          const previewEl = document.getElementById('videoPreview');
          if (!loopPath && data.loop_path && previewEl) {
            const cleanPath = String(data.loop_path).replace(/^\\/+/, '');
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
  }

  await hydrateCreateModuleLists();
}
