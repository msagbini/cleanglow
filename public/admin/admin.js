(() => {
  'use strict';

  const STATUS_LABEL = {
    pending_payment: 'Pending payment',
    paid: 'Paid',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'Expired',
  };

  const FREQUENCY_LABEL = {
    once: 'One-time',
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
  };

  const tbody = document.getElementById('bookingsBody');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const statRow = document.getElementById('statRow');
  const filterTabs = document.getElementById('filterTabs');

  let currentStatus = '';
  let cleaners = [];

  async function fetchBookings() {
    loadingState.hidden = false;
    emptyState.hidden = true;
    tbody.innerHTML = '';

    const url = currentStatus ? `/api/admin/bookings?status=${encodeURIComponent(currentStatus)}` : '/api/admin/bookings';
    const res = await fetch(url);
    if (!res.ok) {
      loadingState.textContent = 'Could not load bookings.';
      return;
    }
    const data = await res.json();
    loadingState.hidden = true;
    renderStats(data.counts);
    renderRows(data.bookings);
  }

  function renderStats(counts) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const chips = [['Total', total], ...Object.entries(STATUS_LABEL).map(([key, label]) => [label, counts[key] || 0])];
    statRow.innerHTML = chips.map(([label, value]) => `
      <div class="stat-chip"><strong>${value}</strong>${label}</div>
    `).join('');
  }

  function renderRows(bookings) {
    if (!bookings.length) {
      emptyState.hidden = false;
      return;
    }
    tbody.innerHTML = bookings.map(b => `
      <tr data-id="${b.id}">
        <td><strong>${b.id}</strong></td>
        <td><span class="status-badge status-${b.status}">${STATUS_LABEL[b.status] || b.status}</span></td>
        <td>${escapeHtml(b.full_name)}<br><span class="muted-text">${escapeHtml(b.email)} · ${escapeHtml(b.phone)}</span></td>
        <td>${escapeHtml(b.property_type)} · ${escapeHtml(b.bedrooms)} bed · ${b.bathrooms} bath(s)<br><span class="muted-text">${escapeHtml(b.address)}</span><br><span class="muted-text">${b.key_access === 'keybox' ? `🔑 ${escapeHtml(b.access_instructions || 'No instructions given')}` : '🚪 Present at property'}</span></td>
        <td>${b.booking_date}<br><span class="muted-text">${b.booking_time}</span></td>
        <td>${escapeHtml(FREQUENCY_LABEL[b.frequency] || b.frequency)}${b.stripe_subscription_id ? '<br><span class="muted-text">recurring</span>' : ''}</td>
        <td><strong>${b.currency === 'aud' ? '$' : b.currency}${(b.amount_cents / 100).toFixed(2)}</strong></td>
        <td>
          <select class="cleaner-select" data-id="${b.id}">
            <option value="">— Unassigned —</option>
            ${cleaners.map(c => `<option value="${c.id}" ${c.id === b.assigned_cleaner_id ? 'selected' : ''} ${!c.active ? 'disabled' : ''}>${escapeHtml(c.name)}${!c.active ? ' (inactive)' : ''}</option>`).join('')}
          </select>
        </td>
        <td>${new Date(b.created_at).toLocaleDateString('en-AU')}</td>
        <td>
          <select class="status-select" data-id="${b.id}">
            ${Object.entries(STATUS_LABEL).map(([value, label]) =>
              `<option value="${value}" ${value === b.status ? 'selected' : ''}>${label}</option>`
            ).join('')}
          </select>
          ${b.stripe_subscription_id && b.status !== 'cancelled' ? `<button type="button" class="btn btn-ghost btn-sm cancel-sub-btn" data-id="${b.id}">Cancel subscription</button>` : ''}
          <br><button type="button" class="btn btn-ghost btn-sm photos-btn" data-id="${b.id}">📷 Photos</button>
        </td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  const photosModal = document.getElementById('photosModal');
  const photosModalGridBefore = document.getElementById('photosModalGridBefore');
  const photosModalGridAfter = document.getElementById('photosModalGridAfter');
  const photosModalBookingId = document.getElementById('photosModalBookingId');
  const afterPhotosForm = document.getElementById('afterPhotosForm');
  const afterPhotosInput = document.getElementById('afterPhotosInput');
  const afterPhotosStatus = document.getElementById('afterPhotosStatus');
  let currentPhotosBookingId = null;

  function renderPhotoGrid(el, photos, emptyMessage) {
    if (!photos.length) {
      el.innerHTML = `<p class="photos-modal-empty">${emptyMessage}</p>`;
      return;
    }
    el.innerHTML = photos.map(p =>
      `<a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="Property photo"></a>`
    ).join('');
  }

  async function openPhotosModal(bookingId) {
    currentPhotosBookingId = bookingId;
    photosModalBookingId.textContent = bookingId;
    photosModalGridBefore.innerHTML = '<p class="muted-text">Loading…</p>';
    photosModalGridAfter.innerHTML = '';
    afterPhotosStatus.textContent = '';
    photosModal.hidden = false;
    document.body.style.overflow = 'hidden';
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/photos`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load photos');
      renderPhotoGrid(photosModalGridBefore, data.photos.filter(p => p.phase !== 'after'), 'No photos were submitted by the customer.');
      renderPhotoGrid(photosModalGridAfter, data.photos.filter(p => p.phase === 'after'), 'No after photos uploaded yet.');
    } catch (err) {
      photosModalGridBefore.innerHTML = `<p class="photos-modal-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  function closePhotosModal() {
    photosModal.hidden = true;
    document.body.style.overflow = '';
  }

  document.getElementById('photosModalClose').addEventListener('click', closePhotosModal);
  photosModal.addEventListener('click', e => {
    if (e.target === photosModal) closePhotosModal();
  });

  afterPhotosForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!afterPhotosInput.files.length || !currentPhotosBookingId) return;
    afterPhotosStatus.textContent = 'Uploading…';
    const formData = new FormData();
    for (const file of afterPhotosInput.files) formData.append('photos', file);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(currentPhotosBookingId)}/photos`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      afterPhotosInput.value = '';
      afterPhotosStatus.textContent = '';
      await openPhotosModal(currentPhotosBookingId);
    } catch (err) {
      afterPhotosStatus.textContent = err.message;
    }
  });

  tbody.addEventListener('click', async e => {
    const photosBtn = e.target.closest('.photos-btn');
    if (photosBtn) {
      openPhotosModal(photosBtn.dataset.id);
      return;
    }
    const btn = e.target.closest('.cancel-sub-btn');
    if (!btn) return;
    const id = btn.dataset.id;

    let chargeFeeCents = 0;
    try {
      const infoRes = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/cancellation-info`);
      const info = await infoRes.json();
      if (infoRes.ok && info.feeApplies) {
        const feeDollars = (info.feeCents / 100).toFixed(2);
        const wantsFee = confirm(
          `This subscription has only completed ${info.cyclesCompleted} of the ${info.minCycles} cycles required before free cancellation.\n\n` +
          `Charge a $${feeDollars} early-cancellation fee to the card on file before cancelling?\n\n` +
          `OK = charge the fee and cancel. Cancel (this dialog) = cancel the subscription with NO fee.`
        );
        if (wantsFee) chargeFeeCents = info.feeCents;
      }
    } catch {
      // If we can't reach the cancellation-info endpoint, fall through to a
      // plain cancel below rather than blocking the admin entirely.
    }

    if (!confirm('Cancel this recurring subscription? The customer will not be billed again.')) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeFeeCents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not cancel the subscription');
      await fetchBookings();
    } catch (err) {
      alert('Error cancelling subscription: ' + err.message);
      btn.disabled = false;
    }
  });

  tbody.addEventListener('change', async e => {
    const statusSelect = e.target.closest('.status-select');
    if (statusSelect) {
      const id = statusSelect.dataset.id;
      const status = statusSelect.value;
      statusSelect.disabled = true;
      try {
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error('Update failed');
        await fetchBookings();
      } catch (err) {
        alert('Error updating status: ' + err.message);
        statusSelect.disabled = false;
      }
      return;
    }

    const cleanerSelect = e.target.closest('.cleaner-select');
    if (cleanerSelect) {
      const id = cleanerSelect.dataset.id;
      cleanerSelect.disabled = true;
      try {
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/assign-cleaner`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cleanerId: cleanerSelect.value || null }),
        });
        if (!res.ok) throw new Error('Update failed');
      } catch (err) {
        alert('Error assigning cleaner: ' + err.message);
      }
      cleanerSelect.disabled = false;
    }
  });

  filterTabs.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    filterTabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    fetchBookings();
  });

  document.getElementById('refreshBtn').addEventListener('click', () => { fetchBookings(); fetchLeads(); fetchCleaners(); });

  const leadsBody = document.getElementById('leadsBody');
  const leadsEmptyState = document.getElementById('leadsEmptyState');
  const LEAD_STATUS_LABEL = { open: 'Waiting', reminded: 'SMS sent', converted: 'Booked ✓' };

  async function fetchLeads() {
    const res = await fetch('/api/admin/leads');
    if (!res.ok) return;
    const { leads } = await res.json();
    if (!leads.length) {
      leadsBody.innerHTML = '';
      leadsEmptyState.hidden = false;
      return;
    }
    leadsEmptyState.hidden = true;
    leadsBody.innerHTML = leads.map(l => `
      <tr>
        <td>${escapeHtml(l.email || '—')}</td>
        <td>${escapeHtml(l.phone || '—')}</td>
        <td>${new Date(l.createdAt).toLocaleString('en-AU')}</td>
        <td>${escapeHtml(LEAD_STATUS_LABEL[l.status] || l.status)}</td>
      </tr>
    `).join('');
  }

  const cleanersBody = document.getElementById('cleanersBody');
  const cleanersEmptyState = document.getElementById('cleanersEmptyState');
  const addCleanerForm = document.getElementById('addCleanerForm');

  async function fetchCleaners() {
    const res = await fetch('/api/admin/cleaners');
    if (!res.ok) return;
    const data = await res.json();
    cleaners = data.cleaners;
    renderCleanersRows();
  }

  function renderCleanersRows() {
    if (!cleaners.length) {
      cleanersBody.innerHTML = '';
      cleanersEmptyState.hidden = false;
      return;
    }
    cleanersEmptyState.hidden = true;
    cleanersBody.innerHTML = cleaners.map(c => {
      const link = `${location.origin}/cleaner/${c.id}`;
      return `
        <tr data-id="${c.id}">
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td class="muted-text">${escapeHtml(c.phone || '—')}${c.email ? `<br>${escapeHtml(c.email)}` : ''}</td>
          <td>
            <a href="${link}" target="_blank" rel="noopener">${link}</a>
            <br><button type="button" class="btn btn-ghost btn-sm cleaner-link-copy" data-link="${link}">Copy link</button>
          </td>
          <td><span class="status-badge ${c.active ? 'status-paid' : 'status-expired'}">${c.active ? 'Active' : 'Inactive'}</span></td>
          <td><button type="button" class="btn btn-ghost btn-sm cleaner-toggle-btn" data-id="${c.id}" data-active="${c.active ? 1 : 0}">${c.active ? 'Deactivate' : 'Reactivate'}</button></td>
        </tr>
      `;
    }).join('');
  }

  addCleanerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('cleanerName').value.trim();
    const phone = document.getElementById('cleanerPhone').value.trim();
    const email = document.getElementById('cleanerEmail').value.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/admin/cleaners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add cleaner');
      addCleanerForm.reset();
      await fetchCleaners();
    } catch (err) {
      alert(err.message);
    }
  });

  cleanersBody.addEventListener('click', async e => {
    const copyBtn = e.target.closest('.cleaner-link-copy');
    if (copyBtn) {
      navigator.clipboard?.writeText(copyBtn.dataset.link).catch(() => {});
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1500);
      return;
    }
    const toggleBtn = e.target.closest('.cleaner-toggle-btn');
    if (toggleBtn) {
      const nextActive = toggleBtn.dataset.active !== '1';
      toggleBtn.disabled = true;
      try {
        const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(toggleBtn.dataset.id)}/active`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: nextActive }),
        });
        if (!res.ok) throw new Error('Update failed');
        await fetchCleaners();
        await fetchBookings();
      } catch (err) {
        alert('Error updating cleaner: ' + err.message);
        toggleBtn.disabled = false;
      }
    }
  });

  (async () => {
    await fetchCleaners();
    fetchBookings();
    fetchLeads();
  })();
})();
