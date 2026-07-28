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
        <td>${escapeHtml(b.property_type)} · ${escapeHtml(b.bedrooms)} bed · ${b.bathrooms} bath(s)<br><span class="muted-text">${escapeHtml(b.address)}</span></td>
        <td>${b.booking_date}<br><span class="muted-text">${b.booking_time}</span></td>
        <td>${escapeHtml(FREQUENCY_LABEL[b.frequency] || b.frequency)}${b.stripe_subscription_id ? '<br><span class="muted-text">recurring</span>' : ''}</td>
        <td><strong>${b.currency === 'aud' ? '$' : b.currency}${(b.amount_cents / 100).toFixed(2)}</strong></td>
        <td>${new Date(b.created_at).toLocaleDateString('en-AU')}</td>
        <td>
          <select class="status-select" data-id="${b.id}">
            ${Object.entries(STATUS_LABEL).map(([value, label]) =>
              `<option value="${value}" ${value === b.status ? 'selected' : ''}>${label}</option>`
            ).join('')}
          </select>
          ${b.stripe_subscription_id && b.status !== 'cancelled' ? `<button type="button" class="btn btn-ghost btn-sm cancel-sub-btn" data-id="${b.id}">Cancel subscription</button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  tbody.addEventListener('click', async e => {
    const btn = e.target.closest('.cancel-sub-btn');
    if (!btn) return;
    if (!confirm('Cancel this recurring subscription? The customer will not be billed again.')) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(btn.dataset.id)}/cancel-subscription`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not cancel the subscription');
      await fetchBookings();
    } catch (err) {
      alert('Error cancelling subscription: ' + err.message);
      btn.disabled = false;
    }
  });

  tbody.addEventListener('change', async e => {
    const select = e.target.closest('.status-select');
    if (!select) return;
    const id = select.dataset.id;
    const status = select.value;
    select.disabled = true;
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
      select.disabled = false;
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

  document.getElementById('refreshBtn').addEventListener('click', fetchBookings);

  fetchBookings();
})();
