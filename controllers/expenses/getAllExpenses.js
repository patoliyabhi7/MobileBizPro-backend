const Expense = require('../../models/expenseModel');

exports.getAllExpenses = async (req, res) => {
    try {
      const expenses = await Expense.find({ isDeleted: false })
      .populate('category').populate('businessLocation').populate('expenseFor').populate('expenseForContact').populate('payments.account').populate('addedBy', 'name _id');
      res.status(200).json(expenses);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };