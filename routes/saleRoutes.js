const express = require('express');
const router = express.Router();
const { uploadMultiple } = require('../middlewares/upload.js');
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { listAllSales } = require('../controllers/sales/listAllSales');
const { addSale } = require('../controllers/sales/addSale');
const { getSaleById } = require('../controllers/sales/getSaleById');
const { updateSale } = require('../controllers/sales/updateSale');
const { deleteSale } = require('../controllers/sales/deleteSale');
const { listSaleReturns } = require('../controllers/sales/listSaleReturns');
const { addSaleReturn } = require('../controllers/sales/addSaleReturn');
const { getAllSalesByBusinessLocation } = require('../controllers/sales/getAllSalesByBusinessLocation');

router.get('/', protect, listAllSales);
router.post('/', protect, authorizeRoles('admin'), uploadMultiple('documents', 5), addSale);
router.get('/returns', protect, listSaleReturns);
router.post('/sale-return', protect, authorizeRoles('admin'), addSaleReturn);
router.get('/location/:locationId', protect, getAllSalesByBusinessLocation);
router.get('/:id', protect, getSaleById);
router.put('/:id', protect, authorizeRoles('admin'), uploadMultiple('documents', 5), updateSale);
router.delete('/:id', protect, authorizeRoles('admin'), deleteSale);

module.exports = router;