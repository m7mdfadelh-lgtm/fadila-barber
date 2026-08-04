const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.JWT_SECRET = 'test-secret';

const Appointment = require('../models/Appointment');
const User = require('../models/User');
const pushService = require('../services/pushService');
const { ownerOnly, protect } = require('../middleware/authMiddleware');
const { jerusalemDateTimeToUtc, getJerusalemDateString } = require('../utils/timeZone');

test('Jerusalem time conversion preserves calendar date and handles DST', () => {
  const winter = jerusalemDateTimeToUtc('2026-01-15', '10:30');
  const summer = jerusalemDateTimeToUtc('2026-08-01', '10:30');
  assert.equal(winter.toISOString(), '2026-01-15T08:30:00.000Z');
  assert.equal(summer.toISOString(), '2026-08-01T07:30:00.000Z');
  assert.equal(getJerusalemDateString(summer), '2026-08-01');
});

test('appointment accepts the canonical no-show status', async () => {
  const appointment = new Appointment({ customerName: 'زبون', customerPhone: '0501234567', service: 'Test', date: new Date(), duration: 30, time: '10:00', status: 'no-show' });
  await appointment.validate();
});

test('customer model enforces valid role and Israeli phone', async () => {
  const user = new User({ username: 'client', password: '123456', role: 'customer', name: 'زبون', phone: '0501234567' });
  await user.validate();
  user.phone = '123';
  await assert.rejects(() => user.validate());
});

test('owner-only middleware rejects customers', () => {
  let status;
  ownerOnly({ user: { role: 'customer' } }, { status(code) { status = code; return this; }, json() {} }, () => assert.fail('must not call next'));
  assert.equal(status, 403);
});

test('authentication middleware accepts a valid active user', async () => {
  const original = User.findById;
  User.findById = async () => ({ active: true, role: 'customer' });
  const token = jwt.sign({ id: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET);
  let called = false;
  await protect({ headers: { authorization: `Bearer ${token}` } }, { status() { return this; }, json() {} }, () => { called = true; });
  User.findById = original;
  assert.equal(called, true);
});

test('push service exposes the configured VAPID public key', async () => {
  assert.equal(await pushService.getPublicKey(), keys.publicKey);
});

test('PWA manifest and service worker contain required install assets', () => {
  const frontend = path.resolve(__dirname, '../../frontend');
  const manifest = JSON.parse(fs.readFileSync(path.join(frontend, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  for (const asset of ['sw.js', 'pwa.js', 'images/icon-192.png', 'images/icon-512.png']) assert.ok(fs.existsSync(path.join(frontend, asset)));
});
