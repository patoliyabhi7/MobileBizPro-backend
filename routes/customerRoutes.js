const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addCustomer } = require('../controllers/contacts/customers/addCustomer');
const { getCustomerById } = require('../controllers/contacts/customers/getCustomerById');
const { getAllCustomers } = require('../controllers/contacts/customers/getAllCustomers');
const { updateCustomer } = require('../controllers/contacts/customers/updateCustomer');
const { deleteCustomer } = require('../controllers/contacts/customers/deleteCustomer');

router.post('/', protect, authorizeRoles('Admin'), addCustomer);
router.get('/', protect, getAllCustomers);
router.get('/:id', protect, getCustomerById);
router.put('/:id', protect, authorizeRoles('Admin'), updateCustomer);
router.delete('/:id', protect, authorizeRoles('Admin'), deleteCustomer);

module.exports = router;