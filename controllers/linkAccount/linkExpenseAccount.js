const Expense = require('../../models/expenseModel');

exports.linkExpenseAccount = async (req, res) => {
    try {
      const expense = await Expense.findByIdAndUpdate(req.params.id, {
        linkedAccount: req.body.accountId
      }, { new: true });
      res.json(expense);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };