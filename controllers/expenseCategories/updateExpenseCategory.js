const ExpenseCategory = require('../../models/expenseCategoryModel');

exports.updateExpenseCategory = async (req, res) => {
    try {
      const category = await ExpenseCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!category) return res.status(404).json({ message: 'Expense Category not found' });
      res.status(200).json({ message: 'Expense Category updated successfully', category });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };