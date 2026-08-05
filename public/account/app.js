(function () {
  const loginView = document.getElementById('loginView');
  const portalView = document.getElementById('portalView');
  const loginFeedback = document.getElementById('loginFeedback');

  function showFeedback(el, message, isError) {
    el.hidden = false;
    el.textContent = message;
    el.className = 'account-feedback' + (isError ? ' account-feedback-error' : '');
  }

  const params = new URLSearchParams(location.search);
  if (params.get('login') === 'invalid') {
    showFeedback(loginFeedback, 'That link is invalid or has expired. Request a new one below.', true);
    history.replaceState(null, '', location.pathname);
  }

  document.getElementById('requestLinkForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch('/api/account/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      showFeedback(loginFeedback, data.message || data.error, !res.ok);
    } catch {
      showFeedback(loginFeedback, 'Something went wrong. Please try again.', true);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/account/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  });

  const STATUS_LABELS = {
    pending_payment: 'Pending payment', paid: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired',
  };

  function bookingCard(b) {
    const canManage = b.accountRole === 'customer' && b.hasActiveSubscription;
    const canShareProof = ['paid', 'completed'].includes(b.status);
    const canBookAgain = b.accountRole === 'customer';
    // Financial details (amount, billing frequency) are only ever sent for
    // the paying customer's own bookings — never for a property manager
    // viewing via agent_email, so this is undefined rather than hidden here.
    const amountLine = b.amount != null
      ? ` · ${b.currency.toUpperCase()} $${b.amount.toFixed(2)}${b.frequency !== 'once' ? ` · ${escapeHtml(b.frequency)}` : ''}`
      : '';
    return `
      <div class="account-booking-card" data-id="${b.id}">
        <div class="account-booking-top">
          <div>
            <div class="account-booking-address">${escapeHtml(b.address)}</div>
            <div class="account-booking-meta">${escapeHtml(b.bookingDate)} · ${escapeHtml(b.bookingTime)}${amountLine}</div>
          </div>
          <div class="account-booking-badges">
            ${b.accountRole === 'agent' ? '<span class="agent-badge">Property manager view</span>' : ''}
            <span class="status-badge status-badge-${b.status}">${STATUS_LABELS[b.status] || b.status}</span>
          </div>
        </div>
        <div class="account-booking-actions">
          ${canShareProof ? `<a class="btn btn-ghost btn-sm" href="/proof/${b.id}" target="_blank" rel="noopener">View proof of clean</a>` : ''}
          ${canManage ? `<button type="button" class="btn btn-ghost btn-sm manage-sub-btn" data-id="${b.id}">Manage subscription</button>` : ''}
          ${canBookAgain ? `<button type="button" class="btn btn-primary btn-sm book-again-btn" data-id="${b.id}">Book again</button>` : ''}
        </div>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let lastBookings = [];
  let accountEmail = '';

  async function loadBookings() {
    const res = await fetch('/api/account/bookings');
    if (!res.ok) return;
    const { bookings } = await res.json();
    lastBookings = bookings;
    const list = document.getElementById('bookingsList');
    document.getElementById('noBookings').hidden = bookings.length > 0;
    list.innerHTML = bookings.map(bookingCard).join('');
    list.querySelectorAll('.manage-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => openCancelModal(btn.dataset.id));
    });
    list.querySelectorAll('.book-again-btn').forEach(btn => {
      btn.addEventListener('click', () => bookAgain(btn.dataset.id));
    });
  }

  // Carries a previous booking's property/contact details over to the
  // homepage booking form via sessionStorage (same-origin, same-tab
  // navigation) rather than a query string, so a tenant's name/phone/address
  // never end up sitting in the browser history or server access logs.
  function bookAgain(bookingId) {
    const booking = lastBookings.find(b => b.id === bookingId);
    if (!booking) return;
    sessionStorage.setItem('cg_rebook_prefill', JSON.stringify({
      propertyType: booking.propertyType,
      bedrooms: booking.bedrooms,
      bathrooms: booking.bathrooms,
      sqm: booking.sqm,
      furnished: booking.furnished,
      address: booking.address,
      postcode: booking.postcode,
      fullName: booking.fullName,
      phone: booking.phone,
      email: accountEmail,
    }));
    location.href = '/?rebook=1#booking';
  }

  async function loadReferral() {
    const res = await fetch('/api/account/referral');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('friendDiscountAmount').textContent = data.friendDiscount;
    document.getElementById('referrerDiscountAmount').textContent = data.friendDiscount;

    const box = document.getElementById('referralCodeBox');
    const noneYet = document.getElementById('noReferralYet');
    if (data.code) {
      box.hidden = false;
      noneYet.hidden = true;
      document.getElementById('referralCodeText').textContent = data.code;
      document.getElementById('shareReferralBtn').dataset.code = data.code;
      document.getElementById('shareReferralBtn').dataset.discount = data.friendDiscount;
    } else {
      box.hidden = true;
      noneYet.hidden = false;
    }

    const rewardsList = document.getElementById('rewardsList');
    rewardsList.innerHTML = data.rewards.map(r => `
      <div class="reward-row ${r.used ? 'reward-used' : ''}">
        <span><code>${escapeHtml(r.code)}</code> — $${r.amount.toFixed(2)} credit</span>
        <span class="reward-badge ${r.used ? 'reward-badge-used' : ''}">${r.used ? 'Used' : 'Available'}</span>
      </div>`).join('');
  }

  document.getElementById('copyReferralBtn').addEventListener('click', () => {
    const code = document.getElementById('referralCodeText').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('copyReferralBtn');
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(() => {});
  });

  document.getElementById('shareReferralBtn').addEventListener('click', e => {
    const btn = e.currentTarget;
    const code = btn.dataset.code;
    const discount = btn.dataset.discount;
    if (!code) return;
    const bookingUrl = `${location.origin}/?ref=${encodeURIComponent(code)}#booking`;
    const message = `I've used CleanGlow for my end of lease clean and it made getting my bond back so much easier. Use my code ${code} for ${discount} off your first clean: ${bookingUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  });

  const cancelModal = document.getElementById('cancelModal');
  const cancelModalBody = document.getElementById('cancelModalBody');
  document.getElementById('cancelModalClose').addEventListener('click', () => { cancelModal.hidden = true; });

  async function openCancelModal(bookingId) {
    cancelModal.hidden = false;
    cancelModalBody.innerHTML = '<p>Loading…</p>';
    const res = await fetch(`/api/account/bookings/${bookingId}/cancellation-info`);
    if (!res.ok) {
      cancelModalBody.innerHTML = '<p>Could not load this booking.</p>';
      return;
    }
    const info = await res.json();
    renderCancelStep(bookingId, info);
  }

  function renderCancelStep(bookingId, info) {
    cancelModalBody.innerHTML = `
      <p>You've completed <strong>${info.cyclesCompleted}</strong> of the <strong>${info.minCycles}</strong> cleans required for the recurring discount.</p>
      ${info.feeApplies
        ? `<p>Cancelling now applies a one-off early-cancellation fee of <strong>$${(info.feeCents / 100).toFixed(2)}</strong>, charged to the card on file.</p>`
        : `<p>You've met the minimum — cancelling now has no fee.</p>`}
      <p class="account-feedback" id="cancelResult" hidden></p>
      <div class="account-booking-actions">
        <button type="button" class="btn btn-primary" id="confirmCancelBtn">${info.feeApplies ? 'Accept fee & cancel' : 'Cancel subscription'}</button>
        <button type="button" class="btn btn-ghost" id="backOutBtn">Never mind</button>
      </div>`;
    document.getElementById('backOutBtn').addEventListener('click', () => { cancelModal.hidden = true; });
    document.getElementById('confirmCancelBtn').addEventListener('click', async () => {
      const btn = document.getElementById('confirmCancelBtn');
      btn.disabled = true;
      try {
        const res = await fetch(`/api/account/bookings/${bookingId}/cancel-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acceptFee: info.feeApplies }),
        });
        const data = await res.json();
        const resultEl = document.getElementById('cancelResult');
        if (res.ok) {
          resultEl.hidden = false;
          resultEl.textContent = 'Subscription cancelled.';
          resultEl.className = 'account-feedback';
          await loadBookings();
          setTimeout(() => { cancelModal.hidden = true; }, 1200);
        } else {
          resultEl.hidden = false;
          resultEl.textContent = data.error || 'Could not cancel — please try again.';
          resultEl.className = 'account-feedback account-feedback-error';
          btn.disabled = false;
        }
      } catch {
        btn.disabled = false;
      }
    });
  }

  async function init() {
    const res = await fetch('/api/account/me');
    if (!res.ok) {
      loginView.hidden = false;
      portalView.hidden = true;
      return;
    }
    const { email } = await res.json();
    accountEmail = email;
    loginView.hidden = true;
    portalView.hidden = false;
    document.getElementById('portalGreeting').textContent = `Hi, ${email}`;
    await Promise.all([loadBookings(), loadReferral()]);
  }

  init();
})();
