const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addSupplier } = require('../controllers/contacts/suppliers/addSupplier');
const { getAllSuppliers } = require('../controllers/contacts/suppliers/getAllSuppliers');
const { getSupplierById } = require('../controllers/contacts/suppliers/getSupplierById');
const { updateSupplier } = require('../controllers/contacts/suppliers/updateSupplier');
const { deleteSupplier } = require('../controllers/contacts/suppliers/deleteSupplier');

router.post('/', protect, authorizeRoles('admin'), addSupplier);
router.get('/', protect, getAllSuppliers);
router.get('/:id', protect, getSupplierById);
router.put('/:id', protect, authorizeRoles('admin'), updateSupplier);
router.delete('/:id', protect, authorizeRoles('admin'), deleteSupplier);

module.exports = router;