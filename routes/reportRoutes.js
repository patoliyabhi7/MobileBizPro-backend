const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { getProfitLossReport } = require('../controllers/reports/profitLossReport');
const { getPurchaseSaleReport } = require('../controllers/reports/purchaseSaleReport');

router.get('/profit-loss', protect, getProfitLossReport);
router.get('/purchase-sale', protect, getPurchaseSaleReport);

module.exports = router;