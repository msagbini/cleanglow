(async () => {
  const card = document.getElementById('resultCard');
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');

  function render(html) { card.innerHTML = html; }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function renderError(message) {
    render(`
      <div class="result-icon">⚠️</div>
      <h1>We couldn't confirm the payment</h1>
      <p>${message}</p>
      <a class="btn btn-primary" href="/index.html#booking">Try again</a>
    `);
  }

  if (!sessionId) {
    renderError('The payment session reference is missing. If you just paid, check your confirmation email.');
    return;
  }

  try {
    const [confirmRes, configRes] = await Promise.all([
      fetch(`/api/checkout-session/${encodeURIComponent(sessionId)}/confirm`),
      fetch('/api/config'),
    ]);
    const data = await confirmRes.json();
    if (!confirmRes.ok) throw new Error(data.error || 'Error verifying the payment');
    const cfg = await configRes.json();

    document.title = `Booking confirmed | ${cfg.business.name}`;
    const currencySymbol = cfg.business.currencySymbol;
    const serviceType = cfg.booking.serviceTypes.find(t => t.value === data.propertyType);
    const sizeOption = cfg.booking.sizeField.options.find(o => o.value === data.bedrooms);
    const propertyLabel = serviceType ? serviceType.label : data.propertyType;
    const sizeLabel = sizeOption ? sizeOption.label : data.bedrooms;

    if (data.paymentStatus === 'paid') {
      // The conversion event. Fired only on a confirmed-paid session, so it
      // counts real revenue rather than checkout attempts. The booking id is
      // the transaction_id, which makes GA4 de-duplicate a refresh of this
      // page instead of counting the same sale twice.
      window.CGAnalytics?.track('purchase', {
        transaction_id: data.id,
        currency: (cfg.business.currencyCode || 'AUD').toUpperCase(),
        value: data.amount,
        items: [{ item_id: data.bedrooms, item_name: `${data.propertyType} clean`, price: data.amount, quantity: 1 }],
      });

      const gstRate = cfg.business.gstRate ?? 0.1;
      const gstAmount = cfg.business.gstRegistered ? data.amount - data.amount / (1 + gstRate) : 0;
      const frequencyOption = cfg.booking.frequencyOptions?.find(f => f.value === data.frequency);
      const isRecurring = frequencyOption && frequencyOption.value !== 'once';

      render(`
        <div class="result-icon">✅</div>
        <h1>${isRecurring ? 'Your recurring clean is now active!' : 'Booking confirmed and paid!'}</h1>
        <p>We've sent the details to <strong>${escapeHtml(data.email)}</strong>. We'll be in touch to confirm access.</p>
        <div class="result-summary">
          <div>${propertyLabel} · ${sizeLabel} · ${data.bathrooms} bathroom(s)</div>
          <div>${data.bookingDate} · ${data.bookingTime} slot</div>
          ${isRecurring
            ? `<div><strong>${currencySymbol}${data.amount.toFixed(2)} per visit</strong>, billed ${frequencyOption.label.toLowerCase()} automatically</div>`
            : `<div><strong>Total paid: ${currencySymbol}${data.amount.toFixed(2)}</strong></div>`}
          ${gstAmount > 0 ? `<div>Includes ${currencySymbol}${gstAmount.toFixed(2)} GST</div>` : ''}
          ${cfg.business.abn ? `<div>ABN: ${cfg.business.abn}</div>` : ''}
        </div>
        <p class="result-ref">Booking reference: <strong>${data.id}</strong></p>
        ${isRecurring ? `<p class="result-ref">You can cancel the recurring plan any time by contacting us.</p>` : ''}
        <div class="result-actions">
          <a class="btn btn-ghost" id="calendarLink" href="/api/bookings/${encodeURIComponent(data.id)}/calendar.ics"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg> Add to calendar</a>
          <a class="btn btn-primary" href="/index.html">Back to home</a>
        </div>
        <p class="result-ref result-autocal-note">Your calendar file should have started downloading automatically — open it to add the appointment. Didn't get it? Use the button above.</p>
      `);
      // No browser API lets a site silently write into someone's Google/Apple
      // calendar without an OAuth consent flow — this is the closest thing to
      // "automatic" that's actually possible: the .ics download itself starts
      // without waiting for a click, the visible button above stays as a
      // manual fallback for whenever they're ready to open it.
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = document.getElementById('calendarLink').href;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, 900);
    } else {
      render(`
        <div class="result-icon">⏳</div>
        <h1>Your payment is processing</h1>
        <p>This can take a few seconds. We'll email you as soon as it's confirmed.</p>
        <p class="result-ref">Booking reference: <strong>${data.id}</strong></p>
        <a class="btn btn-ghost" href="/index.html">Back to home</a>
      `);
    }
  } catch (err) {
    renderError(err.message);
  }
})();
