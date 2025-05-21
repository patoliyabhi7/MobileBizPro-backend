const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { listPurchases } = require('../controllers/purchase/listPurchase');
const { addPurchase } = require('../controllers/purchase/addPurchase');
const { listPurchaseReturns } = require('../controllers/purchase/listPurchaseReturn');
const { deletePurchase } = require('../controllers/purchase/deletePurchase');
const { getPurchaseById } = require('../controllers/purchase/getPurchaseById');
const { updatePurchase } = require('../controllers/purchase/updatePurchase');
const { getAllPurchasesByBusinessLocation } = require('../controllers/purchase/getAllPurchasesByBusinessLocation');

router.get('/', protect, listPurchases);
router.post('/', protect, authorizeRoles('admin'), addPurchase);
router.get('/returns', protect, listPurchaseReturns);
router.get('/location/:locationId', protect, getAllPurchasesByBusinessLocation);
router.get('/:id', protect, getPurchaseById);
router.put('/:id', protect, authorizeRoles('admin'), updatePurchase);
router.delete('/:id', protect, authorizeRoles('admin'), deletePurchase);

module.exports = router;