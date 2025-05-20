const ExpenseCategory = require('../../models/expenseCategoryModel');

exports.getAllExpenseCategories = async (req, res) => {
    try {
      const categories = await ExpenseCategory.find({ isDeleted: false });
      res.status(200).json(categories);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };