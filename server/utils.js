// server/utils.js - Funciones de utilidad
import crypto from 'node:crypto';

export function generateId() {
  return crypto.randomUUID();
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}
