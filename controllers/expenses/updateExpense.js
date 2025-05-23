const Expense = require('../../models/expenseModel');

exports.updateExpense = async (req, res) => {
    try {
      const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!expense || expense.isDeleted) return res.status(404).json({ message: 'Expense not found' });
      res.status(200).json(expense.populate('addedBy', 'name _id'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };