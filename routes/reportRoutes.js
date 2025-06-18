const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { getProfitLossReport } = require('../controllers/reports/profitLossReport');
const { getPurchaseSaleReport } = require('../controllers/reports/purchaseSaleReport');
const { getCustomerSupplierReport } = require('../controllers/reports/customerSupplierReport');
const { getSalesRepresentativeReport } = require('../controllers/reports/salesRepresentativeReport');
const { getExpenseReport } = require('../controllers/reports/expenseReport');
const { getSalePaymentReport } = require('../controllers/reports/salePaymentReport');
const { getPurchasePaymentReport } = require('../controllers/reports/purchasePaymentReport');

router.get('/profit-loss', protect, getProfitLossReport);
router.get('/purchase-sale', protect, getPurchaseSaleReport);
router.get('/customer-supplier', protect, getCustomerSupplierReport);
router.get('/sales-representative', protect, getSalesRepresentativeReport);
router.get('/expense', protect, getExpenseReport);
router.get('/sale-payment', protect, getSalePaymentReport);
router.get('/purchase-payment', protect, getPurchasePaymentReport);

module.exports = router;