const express = require('express');
const router = express.Router();
const { handleWahaWebhook } = require('../controllers/wahaWebhookController');

router.post('/waha', handleWahaWebhook);

module.exports = router;
