const router = require('express').Router();
const auth = require('../controllers/authController');
const { protect, ownerOnly } = require('../middleware/authMiddleware');

router.post('/login', auth.login);
router.get('/me', protect, auth.me);
router.get('/customers', protect, ownerOnly, auth.listCustomers);
router.post('/customers', protect, ownerOnly, auth.createCustomer);
router.put('/customers/:id', protect, ownerOnly, auth.updateCustomer);
router.put('/customers/:id/status', protect, ownerOnly, auth.setCustomerStatus);
router.delete('/customers/:id', protect, ownerOnly, auth.deleteCustomer);

module.exports = router;
