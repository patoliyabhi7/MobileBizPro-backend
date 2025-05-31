const ExpenseCategory = require('../../models/expenseCategoryModel');

exports.getExpenseCategoryById = async (req, res) => {
    try {
      const category = await ExpenseCategory.findById(req.params.id);
      if (!category || category.isDeleted) return res.status(404).json({ message: 'Expense Category not found' });
      res.status(200).json(category);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };