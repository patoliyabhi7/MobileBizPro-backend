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
const { getTrendingProductsReport } = require('../controllers/reports/trendingProductsReport');
const { getProductPurchaseReport } = require('../controllers/reports/productPurchaseReport');
const { getProductSellReport } = require('../controllers/reports/productSellReport');
const { getItemsReport } = require('../controllers/reports/itemsReport');
const { getStockReport } = require('../controllers/reports/stockReport');
const { getStockHistoryReport } = require('../controllers/reports/stockHistoryReport');
const { getViewContactReport } = require('../controllers/reports/viewContactReport');

router.get('/profit-loss', protect, getProfitLossReport);
router.get('/purchase-sale', protect, getPurchaseSaleReport);
router.get('/customer-supplier', protect, getCustomerSupplierReport);
router.get('/sales-representative', protect, getSalesRepresentativeReport);
router.get('/expense', protect, getExpenseReport);
router.get('/sale-payment', protect, getSalePaymentReport);
router.get('/purchase-payment', protect, getPurchasePaymentReport);
router.get('/trending-products', protect, getTrendingProductsReport);
router.get('/product-purchase', protect, getProductPurchaseReport);
router.get('/product-sell', protect, getProductSellReport);
router.get('/items', protect, getItemsReport);
router.get('/stock', protect, getStockReport);
router.get('/stock-history', protect, getStockHistoryReport);
router.get('/view-contact', protect, getViewContactReport);

module.exports = router;