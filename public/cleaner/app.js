(() => {
  'use strict';

  // The token in the URL path (/cleaner/<token>) is the only credential —
  // no login. Every request below is scoped to it.
  const token = location.pathname.split('/').filter(Boolean).pop();

  const els = {
    greeting: document.getElementById('cleanerGreeting'),
    invalidState: document.getElementById('invalidState'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    jobsList: document.getElementById('jobsList'),
    refreshBtn: document.getElementById('refreshBtn'),
    jobModal: document.getElementById('jobModal'),
    jobModalTitle: document.getElementById('jobModalTitle'),
    jobModalBody: document.getElementById('jobModalBody'),
    jobModalClose: document.getElementById('jobModalClose'),
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function api(path, options) {
    return fetch(`/api/cleaner/${encodeURIComponent(token)}${path}`, options);
  }

  async function loadJobs() {
    els.loadingState.hidden = false;
    els.emptyState.hidden = true;
    els.jobsList.innerHTML = '';
    try {
      const meRes = await api('/me');
      if (!meRes.ok) throw new Error('invalid');
      const me = await meRes.json();
      els.greeting.textContent = `Hi ${me.name} — your jobs`;

      const jobsRes = await api('/jobs');
      const data = await jobsRes.json();
      if (!jobsRes.ok) throw new Error(data.error || 'Could not load jobs');

      if (!data.jobs.length) {
        els.emptyState.hidden = false;
        return;
      }
      els.jobsList.innerHTML = data.jobs.map(renderJobCard).join('');
    } catch (err) {
      els.invalidState.hidden = false;
      els.invalidState.textContent = err.message === 'invalid'
        ? "This link isn't valid anymore. Ask your admin for a new one."
        : err.message;
    } finally {
      els.loadingState.hidden = true;
    }
  }

  function renderJobCard(job) {
    return `
      <div class="job-card">
        <div class="job-card-main">
          <span class="job-card-date">${escapeHtml(job.bookingDate)} · ${escapeHtml(job.bookingTime)}</span>
          <span class="job-card-address">${escapeHtml(job.address)}, ${escapeHtml(job.postcode)}</span>
          <span class="job-card-meta">${escapeHtml(job.propertyType)} · ${escapeHtml(job.bedrooms)} bed · ${job.bathrooms} bath(s)</span>
        </div>
        <div>
          <span class="status-badge status-${job.status}">${job.status === 'completed' ? 'Completed' : 'To do'}</span>
          <button type="button" class="btn btn-primary btn-sm job-open-btn" data-id="${job.id}">Open</button>
        </div>
      </div>
    `;
  }

  let currentJobsById = {};

  async function openJob(id) {
    const jobsRes = await api('/jobs');
    const data = await jobsRes.json();
    currentJobsById = Object.fromEntries((data.jobs || []).map(j => [j.id, j]));
    const job = currentJobsById[id];
    if (!job) return;

    els.jobModalTitle.textContent = `${job.bookingDate} · ${job.bookingTime}`;
    els.jobModalBody.innerHTML = `
      <div class="job-detail-grid">
        <div><strong>Customer</strong>${escapeHtml(job.fullName)}</div>
        <div><strong>Phone</strong>${escapeHtml(job.phone)}</div>
        <div><strong>Address</strong>${escapeHtml(job.address)}, ${escapeHtml(job.postcode)}</div>
        <div><strong>Property</strong>${escapeHtml(job.propertyType)} · ${escapeHtml(job.bedrooms)} bed · ${job.bathrooms} bath(s)${job.sqm ? ` · ${job.sqm}m²` : ''}</div>
        <div><strong>Key access</strong>${escapeHtml(job.keyAccess || 'Not specified')}</div>
        <div><strong>Extras</strong>${job.extras && job.extras.length ? escapeHtml(job.extras.join(', ')) : 'None'}</div>
      </div>
      ${job.notesProperty ? `<div class="job-notes">${escapeHtml(job.notesProperty)}</div>` : ''}

      <h4>Before (submitted by the customer)</h4>
      <div class="photos-modal-grid" id="gridBefore"></div>

      <h4>After (upload once you're done)</h4>
      <div class="photos-modal-grid" id="gridAfter"></div>
      <form id="uploadForm" class="after-photos-form">
        <input type="file" id="uploadInput" accept="image/jpeg,image/png,image/webp" multiple>
        <button type="submit" class="btn btn-primary btn-sm">Upload after photos</button>
        <span id="uploadStatus" class="muted-text"></span>
      </form>

      <div class="job-modal-actions">
        ${job.status !== 'completed'
          ? (job.onWaySent
            ? `<span class="status-badge status-paid">"On my way" sent ✓</span>`
            : `<button type="button" class="btn btn-ghost" id="onWayBtn">Notify: on my way</button>`)
          : ''}
        ${job.status === 'completed'
          ? `<span class="status-badge status-completed">Already marked completed</span>`
          : `<button type="button" class="btn btn-success" id="markCompleteBtn">Mark job as completed</button>`}
      </div>
    `;
    els.jobModal.hidden = false;
    document.body.style.overflow = 'hidden';
    await loadJobPhotos(id);

    document.getElementById('uploadForm').addEventListener('submit', async e => {
      e.preventDefault();
      const input = document.getElementById('uploadInput');
      const status = document.getElementById('uploadStatus');
      if (!input.files.length) return;
      status.textContent = 'Uploading…';
      const formData = new FormData();
      for (const file of input.files) formData.append('photos', file);
      try {
        const res = await api(`/bookings/${encodeURIComponent(id)}/photos?phase=after`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        input.value = '';
        status.textContent = '';
        await loadJobPhotos(id);
      } catch (err) {
        status.textContent = err.message;
      }
    });

    const onWayBtn = document.getElementById('onWayBtn');
    if (onWayBtn) {
      onWayBtn.addEventListener('click', async () => {
        onWayBtn.disabled = true;
        onWayBtn.textContent = 'Sending…';
        try {
          const res = await api(`/bookings/${encodeURIComponent(id)}/on-way`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not send');
          onWayBtn.outerHTML = '<span class="status-badge status-paid">"On my way" sent ✓</span>';
        } catch (err) {
          onWayBtn.disabled = false;
          onWayBtn.textContent = 'Notify: on my way';
          alert(err.message);
        }
      });
    }

    const completeBtn = document.getElementById('markCompleteBtn');
    if (completeBtn) {
      completeBtn.addEventListener('click', async () => {
        completeBtn.disabled = true;
        completeBtn.textContent = 'Marking…';
        try {
          const res = await api(`/bookings/${encodeURIComponent(id)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not mark job as completed');
          closeModal();
          await loadJobs();
        } catch (err) {
          completeBtn.disabled = false;
          completeBtn.textContent = 'Mark job as completed';
          alert(err.message);
        }
      });
    }
  }

  function renderPhotoGrid(el, photos, emptyMessage) {
    if (!photos.length) {
      el.innerHTML = `<p class="photos-modal-empty">${emptyMessage}</p>`;
      return;
    }
    el.innerHTML = photos.map(p => `<a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="Property photo"></a>`).join('');
  }

  async function loadJobPhotos(id) {
    const res = await api(`/bookings/${encodeURIComponent(id)}/photos`);
    const data = await res.json();
    if (!res.ok) return;
    renderPhotoGrid(document.getElementById('gridBefore'), data.photos.filter(p => p.phase !== 'after'), 'No photos submitted by the customer.');
    renderPhotoGrid(document.getElementById('gridAfter'), data.photos.filter(p => p.phase === 'after'), 'No after photos uploaded yet.');
  }

  function closeModal() {
    els.jobModal.hidden = true;
    document.body.style.overflow = '';
  }

  els.jobModalClose.addEventListener('click', closeModal);
  els.jobModal.addEventListener('click', e => { if (e.target === els.jobModal) closeModal(); });

  els.jobsList.addEventListener('click', e => {
    const btn = e.target.closest('.job-open-btn');
    if (btn) openJob(btn.dataset.id);
  });

  els.refreshBtn.addEventListener('click', loadJobs);

  loadJobs();
})();
