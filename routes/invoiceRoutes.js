const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');
const { uploadSingle } = require('../middlewares/upload.js');

const { addInvoiceLayout } = require('../controllers/invoice/addInvoiceLayout');
const { getAllInvoiceLayouts } = require('../controllers/invoice/getAllInvoiceLayouts');
const { getInvoiceLayoutById } = require('../controllers/invoice/getInvoiceLayoutById');
const { updateInvoiceLayout } = require('../controllers/invoice/updateInvoiceLayout');
const { deleteInvoiceLayout } = require('../controllers/invoice/deleteInvoiceLayout');
const { setDefaultInvoiceLayout } = require('../controllers/invoice/setDefaultInvoiceLayout');
const { generateInvoice } = require('../controllers/invoice/generateInvoice');

router.get('/generate/:saleId', generateInvoice);
router.post('/layouts/', protect, authorizeRoles('admin'), uploadSingle('logo'), addInvoiceLayout);
router.get('/layouts/', protect, getAllInvoiceLayouts);
router.get('/layouts/:id', protect, getInvoiceLayoutById);
router.put('/layouts/:id', protect, authorizeRoles('admin'), uploadSingle('logo'), updateInvoiceLayout);
router.delete('/layouts/:id', protect, authorizeRoles('admin'), deleteInvoiceLayout);
router.put('/layouts/default/:id', protect, authorizeRoles('admin'), setDefaultInvoiceLayout);

module.exports = router;