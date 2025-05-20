const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addExpense } = require('../controllers/expenses/addExpense');
const { getAllExpenses } = require('../controllers/expenses/getAllExpenses');
const { getExpenseById } = require('../controllers/expenses/getExpenseById');
const { updateExpense } = require('../controllers/expenses/updateExpense');
const { deleteExpense } = require('../controllers/expenses/deleteExpense');

router.post('/', protect, authorizeRoles('admin'), addExpense);
router.get('/', protect, getAllExpenses);
router.get('/:id', protect, getExpenseById);
router.put('/:id', protect, authorizeRoles('admin'), updateExpense);
router.delete('/:id', protect, authorizeRoles('admin'), deleteExpense);

module.exports = router;