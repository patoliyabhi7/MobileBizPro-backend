const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { linkSaleAccount } = require('../controllers/linkAccount/linkSaleAccount');
const { linkPurchaseAccount } = require('../controllers/linkAccount/linkPurchaseAccount');
const { linkExpenseAccount } = require('../controllers/linkAccount/linkExpenseAccount');

router.post('/sale/:id/link-account', protect, authorizeRoles('admin'), linkSaleAccount);
router.post('/purchase/:id/link-account', protect, authorizeRoles('admin'), linkPurchaseAccount);
router.post('/expense/:id/link-account', protect, authorizeRoles('admin'), linkExpenseAccount);

module.exports = router;