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

router.get('/profit-loss',  getProfitLossReport);
router.get('/purchase-sale',  getPurchaseSaleReport);
router.get('/customer-supplier',  getCustomerSupplierReport);
router.get('/sales-representative',  getSalesRepresentativeReport);
router.get('/expense',  getExpenseReport);
router.get('/sale-payment',  getSalePaymentReport);
router.get('/purchase-payment',  getPurchasePaymentReport);
router.get('/trending-products',  getTrendingProductsReport);
router.get('/product-purchase',  getProductPurchaseReport);
router.get('/product-sell',  getProductSellReport);
router.get('/items',  getItemsReport);
router.get('/stock',  getStockReport);
router.get('/stock-history',  getStockHistoryReport);
router.get('/view-contact',  getViewContactReport);

module.exports = router;