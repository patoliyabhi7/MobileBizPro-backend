const ExpenseCategory = require('../../models/expenseCategoryModel');

exports.addExpenseCategory = async (req, res) => {
  try {
    const category = new ExpenseCategory(req.body);
    await category.save();
    res.status(201).json({ message: 'Expense Category created successfully', category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};