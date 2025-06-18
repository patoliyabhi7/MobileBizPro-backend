const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { getProfitLossReport } = require('../controllers/reports/profitLossReport');
const { getPurchaseSaleReport } = require('../controllers/reports/purchaseSaleReport');
const { getCustomerSupplierReport } = require('../controllers/reports/customerSupplierReport');
const { getSalesRepresentativeReport } = require('../controllers/reports/salesRepresentativeReport');

router.get('/profit-loss', protect, getProfitLossReport);
router.get('/purchase-sale', protect, getPurchaseSaleReport);
router.get('/customer-supplier', protect, getCustomerSupplierReport);
router.get('/sales-representative', protect, getSalesRepresentativeReport);

module.exports = router;