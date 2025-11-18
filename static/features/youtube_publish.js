// YouTube publishing panel: tabs, source selection, and upload.
import { toast } from './common.js';

export async function initYoutubePanel(_containerEl, { state } = {}) {
  const view = document.getElementById('publish-view');
  if (!view) return;
  if (!view.dataset.youtubeInit) {
    wirePublishTabs();
    wireSourceToggle(state);
    wireUploadForm(state);
    view.dataset.youtubeInit = 'true';
  } else {
    syncAuthWarning(state);
  }
}

function wirePublishTabs() {
  const publishTabs = Array.from(document.querySelectorAll('.publish-tab'));
  if (!publishTabs.length) return;
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

function syncAuthWarning(state) {
  const warn = document.getElementById('publishAuthWarning');
  if (warn) warn.classList.toggle('hidden', Boolean(state?.user));
}

function wireSourceToggle(state) {
  const sourceRadios = Array.from(document.querySelectorAll('input[name="ytSourceMode"]'));
  const uploadGroup = document.getElementById('ytUploadGroup');
  const libraryGroup = document.getElementById('ytLibraryGroup');
  syncAuthWarning(state);
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
}

function wireUploadForm(state) {
  const sourceRadios = Array.from(document.querySelectorAll('input[name="ytSourceMode"]'));
  const librarySelect = document.getElementById('ytLibrarySelect');
  const ytUploadBtn = document.getElementById('ytUploadBtn');
  syncAuthWarning(state);
  if (!ytUploadBtn) return;
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
