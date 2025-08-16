const express = require('express');
const router = express.Router();
const { uploadMultiple } = require('../middlewares/upload.js');
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addExpense } = require('../controllers/expenses/addExpense');
const { getAllExpenses } = require('../controllers/expenses/getAllExpenses');
const { getExpenseById } = require('../controllers/expenses/getExpenseById');
const { updateExpense } = require('../controllers/expenses/updateExpense');
const { deleteExpense } = require('../controllers/expenses/deleteExpense');
const { getAllExpensesByBusinessLocation } = require('../controllers/expenses/getAllExpensesByBusinessLocation');
const { addExpensePayment } = require('../controllers/expenses/addExpensePayment');

router.post('/', protect, authorizeRoles('admin'), uploadMultiple('documents', 5), addExpense);
router.get('/location/:locationId', protect, getAllExpensesByBusinessLocation);
router.post('/payment/:expenseId', protect, authorizeRoles('admin'), addExpensePayment);
router.get('/', protect, getAllExpenses);
router.get('/:id', protect, getExpenseById);
router.put('/:id', protect, authorizeRoles('admin'), uploadMultiple('documents', 5), updateExpense);
router.delete('/:id', protect, authorizeRoles('admin'), deleteExpense);

module.exports = router;