const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addAccount } = require('../controllers/accounts/addAccount');
const { getAccountById } = require('../controllers/accounts/getAccountById');
const { updateAccount } = require('../controllers/accounts/updateAccount');
const { toggleAccountStatus } = require('../controllers/accounts/toggleAccountStatus');
const { getAllClosedAccount } = require('../controllers/accounts/getAllClosedAccount');
const { getAllActiveAccount } = require('../controllers/accounts/getAllActiveAccount');

router.post('/', protect, authorizeRoles('admin'), addAccount);
router.get('/closed', protect, authorizeRoles('admin'), getAllClosedAccount);
router.get('/active', protect, authorizeRoles('admin'), getAllActiveAccount);
router.put('/toggle/:id', protect, authorizeRoles('admin'), toggleAccountStatus);
router.get('/:id', protect, authorizeRoles('admin'), getAccountById);
router.put('/:id', protect, authorizeRoles('admin'), updateAccount);

module.exports = router;