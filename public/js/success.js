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
      <h3>We couldn't confirm the payment</h3>
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
      const gstRate = cfg.business.gstRate ?? 0.1;
      const gstAmount = cfg.business.gstRegistered ? data.amount - data.amount / (1 + gstRate) : 0;
      const frequencyOption = cfg.booking.frequencyOptions?.find(f => f.value === data.frequency);
      const isRecurring = frequencyOption && frequencyOption.value !== 'once';

      render(`
        <div class="result-icon">✅</div>
        <h3>${isRecurring ? 'Your recurring clean is now active!' : 'Booking confirmed and paid!'}</h3>
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
        <a class="btn btn-primary" href="/index.html">Back to home</a>
      `);
    } else {
      render(`
        <div class="result-icon">⏳</div>
        <h3>Your payment is processing</h3>
        <p>This can take a few seconds. We'll email you as soon as it's confirmed.</p>
        <p class="result-ref">Booking reference: <strong>${data.id}</strong></p>
        <a class="btn btn-ghost" href="/index.html">Back to home</a>
      `);
    }
  } catch (err) {
    renderError(err.message);
  }
})();
