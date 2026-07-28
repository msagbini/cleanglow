(async () => {
  const card = document.getElementById('resultCard');
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');

  function render(html) { card.innerHTML = html; }

  function renderError(message) {
    render(`
      <div class="result-icon">⚠️</div>
      <h3>No pudimos confirmar el pago</h3>
      <p>${message}</p>
      <a class="btn btn-primary" href="/index.html#booking">Volver a intentar</a>
    `);
  }

  if (!sessionId) {
    renderError('Falta la referencia de la sesión de pago. Si acabas de pagar, revisa tu email de confirmación.');
    return;
  }

  try {
    const [confirmRes, configRes] = await Promise.all([
      fetch(`/api/checkout-session/${encodeURIComponent(sessionId)}/confirm`),
      fetch('/api/config'),
    ]);
    const data = await confirmRes.json();
    if (!confirmRes.ok) throw new Error(data.error || 'Error al verificar el pago');
    const cfg = await configRes.json();

    document.title = `Reserva confirmada | ${cfg.business.name}`;
    const currencySymbol = cfg.business.currencySymbol;
    const serviceType = cfg.booking.serviceTypes.find(t => t.value === data.propertyType);
    const sizeOption = cfg.booking.sizeField.options.find(o => o.value === data.bedrooms);
    const propertyLabel = serviceType ? serviceType.label : data.propertyType;
    const sizeLabel = sizeOption ? sizeOption.label : data.bedrooms;

    if (data.paymentStatus === 'paid') {
      render(`
        <div class="result-icon">✅</div>
        <h3>¡Reserva confirmada y pagada!</h3>
        <p>Hemos enviado los detalles a <strong>${data.email}</strong>. Te contactaremos para confirmar el acceso.</p>
        <div class="result-summary">
          <div>${propertyLabel} · ${sizeLabel} · ${data.bathrooms} baño(s)</div>
          <div>${data.bookingDate} · franja ${data.bookingTime}</div>
          <div><strong>Total pagado: ${data.amount.toFixed(2)}${currencySymbol}</strong></div>
        </div>
        <p class="result-ref">Referencia de reserva: <strong>${data.id}</strong></p>
        <a class="btn btn-primary" href="/index.html">Volver al inicio</a>
      `);
    } else {
      render(`
        <div class="result-icon">⏳</div>
        <h3>Tu pago se está procesando</h3>
        <p>Esto puede tardar unos segundos. Te avisaremos por email en cuanto se confirme.</p>
        <p class="result-ref">Referencia de reserva: <strong>${data.id}</strong></p>
        <a class="btn btn-ghost" href="/index.html">Volver al inicio</a>
      `);
    }
  } catch (err) {
    renderError(err.message);
  }
})();
