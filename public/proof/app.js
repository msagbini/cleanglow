(() => {
  'use strict';

  // The booking reference in the URL (/proof/<id>) is the only credential —
  // same unguessable-id trust model as a booking reference generally. No
  // login: this page is meant to be forwarded to a third party (a property
  // manager) who has no CleanGlow account.
  const bookingId = location.pathname.split('/').filter(Boolean).pop();

  document.getElementById('printBtn').addEventListener('click', () => window.print());

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showError(message) {
    document.getElementById('proofWrap').hidden = true;
    document.getElementById('proofError').hidden = false;
    document.getElementById('proofErrorText').textContent = message;
  }

  async function init() {
    let res;
    try {
      res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/proof`);
    } catch {
      return showError('Could not load this page. Please try again.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return showError(data.error || 'This proof-of-clean link isn\'t available.');
    }
    const { booking, photos, checklist, business } = await res.json();

    document.getElementById('proofWrap').hidden = false;
    document.getElementById('proofBusinessName').textContent = business.name;
    document.title = `Proof of clean — ${booking.id}`;

    const dateFormatted = new Date(`${booking.bookingDate}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('proofMeta').textContent = `${booking.address} · ${dateFormatted} · Reference ${booking.id}`;

    const before = photos.filter(p => p.phase === 'before');
    const after = photos.filter(p => p.phase === 'after');
    document.getElementById('proofPhotosBefore').innerHTML = before.length
      ? `<p class="proof-photo-label">Before</p>${before.map(p => `<img src="${p.url}" alt="Before photo" loading="lazy">`).join('')}` : '';
    document.getElementById('proofPhotosAfter').innerHTML = after.length
      ? `<p class="proof-photo-label">After</p>${after.map(p => `<img src="${p.url}" alt="After photo" loading="lazy">`).join('')}` : '';
    document.getElementById('noPhotosNote').hidden = photos.length > 0;

    document.getElementById('proofChecklist').innerHTML = checklist.columns.map(col => `
      <ul>${col.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    `).join('');

    document.getElementById('guaranteeTitle').textContent = checklist.guarantee.title;
    document.getElementById('guaranteeDescription').textContent = checklist.guarantee.description;
    document.getElementById('guaranteePoints').innerHTML = checklist.guarantee.points.map(p => `<li>${escapeHtml(p)}</li>`).join('');
  }

  init();
})();
