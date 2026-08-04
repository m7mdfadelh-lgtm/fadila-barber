const router = require('express').Router();
const auth = require('../controllers/authController');
const { protect, ownerOnly } = require('../middleware/authMiddleware');

router.post('/login', auth.login);
router.get('/me', protect, auth.me);
router.get('/customers', protect, ownerOnly, auth.listCustomers);
router.post('/customers', protect, ownerOnly, auth.createCustomer);

module.exports = router;
