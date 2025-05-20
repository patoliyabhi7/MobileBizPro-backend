const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addExpenseCategory } = require('../controllers/expenseCategories/addExpenseCategory');
const { getAllExpenseCategories } = require('../controllers/expenseCategories/getAllExpenseCategories');
const { getExpenseCategoryById } = require('../controllers/expenseCategories/getExpenseCategoryById');
const { updateExpenseCategory } = require('../controllers/expenseCategories/updateExpenseCategory');
const { deleteExpenseCategory } = require('../controllers/expenseCategories/deleteExpenseCategory');

router.post('/', protect, authorizeRoles('admin'), addExpenseCategory);
router.get('/', protect, getAllExpenseCategories);
router.get('/:id', protect, getExpenseCategoryById);
router.put('/:id', protect, authorizeRoles('admin'), updateExpenseCategory);
router.delete('/:id', protect, authorizeRoles('admin'), deleteExpenseCategory);

module.exports = router;