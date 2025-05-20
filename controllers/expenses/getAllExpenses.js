const Expense = require('../../models/expenseModel');

exports.getAllExpenses = async (req, res) => {
    try {
      const expenses = await Expense.find({ isDeleted: false })
        .populate('category')
        .populate('businessLocation')
        .populate('contact');
      res.status(200).json(expenses);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };