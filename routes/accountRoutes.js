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
const { fundTransfer } = require('../controllers/accounts/fundTransfer');
const { depositToAccount } = require('../controllers/accounts/depositToAccount');
const { getAccountBook } = require('../controllers/accounts/getAccountBook');
const { getBalanceSheet } = require('../controllers/accounts/getBalanceSheet');
const { getCashFlow } = require('../controllers/accounts/getCashFlow');
const { getPaymentsAccountReport } = require('../controllers/accounts/getPaymentsAccountReport');
const { getAllActiveAccountsByLocation } = require('../controllers/accounts/getAllActiveAccountsByLocation');
const { getAllClosedAccountsByLocation } = require('../controllers/accounts/getAllClosedAccountsByLocation');

router.post('/', protect, authorizeRoles('admin'), addAccount);
router.get('/closed', protect, authorizeRoles('admin'), getAllClosedAccount);
router.get('/active', protect, authorizeRoles('admin'), getAllActiveAccount);
router.get('/closed/:id', protect, authorizeRoles('admin'), getAllClosedAccountsByLocation);
router.get('/active/:id', protect, authorizeRoles('admin'), getAllActiveAccountsByLocation);
router.post('/transfer', protect, authorizeRoles('admin'), fundTransfer);
router.post('/deposit', protect, authorizeRoles('admin'), depositToAccount);
router.get('/balance-sheet', protect, authorizeRoles('admin'), getBalanceSheet);
//GET /api/accounts/cash-flow?account_id=123&location_id=456&account_type=credit&start_date=2025-05-01&end_date=2025-05-31
router.get('/cash-flow', protect, authorizeRoles('admin'), getCashFlow);
router.get('/payments-report', protect, authorizeRoles('admin'), getPaymentsAccountReport);
router.put('/toggle/:id', protect, authorizeRoles('admin'), toggleAccountStatus);
router.get('/book/:id', protect, authorizeRoles('admin'), getAccountBook);
router.get('/:id', protect, authorizeRoles('admin'), getAccountById);
router.put('/:id', protect, authorizeRoles('admin'), updateAccount);

module.exports = router;