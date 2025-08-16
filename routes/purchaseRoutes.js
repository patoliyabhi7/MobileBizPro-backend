const express = require('express');
const router = express.Router();
const { uploadMultiple } = require('../middlewares/upload.js');
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { listPurchases } = require('../controllers/purchase/listPurchase');
const { addPurchase } = require('../controllers/purchase/addPurchase');
const { listPurchaseReturns } = require('../controllers/purchase/listPurchaseReturn');
const { deletePurchase } = require('../controllers/purchase/deletePurchase');
const { getPurchaseById } = require('../controllers/purchase/getPurchaseById');
const { updatePurchase } = require('../controllers/purchase/updatePurchase');
const { addPurchaseReturn } = require('../controllers/purchase/addPurchaseReturn');
const { getRecentPurchasePrice } = require('../controllers/purchase/getRecentPurchasePrice');
const { getAllPurchasesByBusinessLocation } = require('../controllers/purchase/getAllPurchasesByBusinessLocation');
const { getPurchaseDuePayments } = require('../controllers/purchase/getPurchaseDuePayments');
const { updatePurchaseReturn } = require('../controllers/purchase/updatePurchaseReturn');
const { addPurchasePayment } = require('../controllers/purchase/addpurchasepayment');

router.get('/', protect, listPurchases);
router.post('/', protect, authorizeRoles('admin'), uploadMultiple('documents', 5), addPurchase);
router.get('/due-payments/:locationId', protect, getPurchaseDuePayments);
router.get('/returns/:locationId', protect, listPurchaseReturns);
router.post('/returns/:oldPurchaseId', protect, authorizeRoles('admin'), addPurchaseReturn);
router.put('/returns/:id', protect, authorizeRoles('admin'), updatePurchaseReturn);
router.post('/payment/:purchaseId', protect, authorizeRoles('admin'), addPurchasePayment);
router.get('/location/:locationId', protect, getAllPurchasesByBusinessLocation);
router.get('/recent-price/:productId', protect, getRecentPurchasePrice);
router.get('/:id', protect, getPurchaseById);
router.put('/:id', protect, authorizeRoles('admin'), uploadMultiple('documents', 5), updatePurchase);
router.delete('/:id', protect, authorizeRoles('admin'), deletePurchase);

module.exports = router;