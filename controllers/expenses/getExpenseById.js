const Expense = require('../../models/expenseModel');

exports.getExpenseById = async (req, res) => {
    try {
      const expense = await Expense.findById(req.params.id)
      .populate('category').populate('businessLocation').populate('expenseFor').populate('expenseForContact').populate('payments.account').populate('addedBy', 'name _id');
      if (!expense || expense.isDeleted) return res.status(404).json({ message: 'Expense not found' });
      res.status(200).json(expense);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };