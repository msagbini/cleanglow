import { Router } from 'express';
import { listBookings, countBookingsByStatus, markBookingStatus, getBooking, isValidStatus } from '../db.js';

const router = Router();

router.get('/bookings', (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const bookings = listBookings({ status });
  res.json({ bookings, counts: countBookingsByStatus() });
});

router.patch('/bookings/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!isValidStatus(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const existing = getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Reserva no encontrada' });

  const updated = markBookingStatus(req.params.id, status);
  res.json(updated);
});

export default router;
