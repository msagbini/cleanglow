(() => {
  'use strict';

  CGI18N.applyStatic();
  CGI18N.initToggleButtons();

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
      res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/proof?lang=${CGI18N.getLang()}`);
    } catch {
      return showError(CGI18N.t('toast.genericError', 'Could not load this page. Please try again.'));
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return showError(data.error || CGI18N.t('proof.notAvailableText', 'This proof-of-clean link isn\'t available.'));
    }
    const { booking, photos, checklist, business } = await res.json();

    document.getElementById('proofWrap').hidden = false;
    document.getElementById('proofBusinessName').textContent = business.name;
    document.title = CGI18N.tf('proof.pageTitle', id => `Proof of clean — ${id}`, booking.id);

    const isEs = CGI18N.getLang() === 'es';
    const dateFormatted = new Date(`${booking.bookingDate}T00:00:00`).toLocaleDateString(isEs ? 'es-AU' : 'en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('proofMeta').textContent = CGI18N.tf(
      'proof.metaLine',
      (addr, date, ref) => `${addr} · ${date} · Reference ${ref}`,
      booking.address, dateFormatted, booking.id
    );

    const before = photos.filter(p => p.phase === 'before');
    const after = photos.filter(p => p.phase === 'after');
    const beforeLabel = CGI18N.t('proof.before', 'Before');
    const afterLabel = CGI18N.t('proof.after', 'After');
    document.getElementById('proofPhotosBefore').innerHTML = before.length
      ? `<p class="proof-photo-label">${beforeLabel}</p>${before.map(p => `<img src="${p.url}" alt="${beforeLabel}" loading="lazy">`).join('')}` : '';
    document.getElementById('proofPhotosAfter').innerHTML = after.length
      ? `<p class="proof-photo-label">${afterLabel}</p>${after.map(p => `<img src="${p.url}" alt="${afterLabel}" loading="lazy">`).join('')}` : '';
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
