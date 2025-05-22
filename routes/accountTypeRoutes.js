const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addAccountType } = require('../controllers/accountType/addAccountType');
const { getAllAccountTypes } = require('../controllers/accountType/getAllAccountTypes');
const { getAccountTypeById } = require('../controllers/accountType/getAccountTypeById');
const { updateAccountType } = require('../controllers/accountType/updateAccountType');
const { deleteAccountType } = require('../controllers/accountType/deleteAccountType');

router.post('/', protect, authorizeRoles('admin'), addAccountType);
router.get('/', protect, authorizeRoles('admin'), getAllAccountTypes);
router.get('/:id', protect, authorizeRoles('admin'), getAccountTypeById);
router.put('/:id', protect, authorizeRoles('admin'), updateAccountType);
router.delete('/:id', protect, authorizeRoles('admin'), deleteAccountType);

module.exports = router;
