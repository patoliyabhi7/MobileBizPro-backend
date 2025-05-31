const Expense = require('../../models/expenseModel');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.deleteExpense = async (req, res) => {
    try {
      const expense = await Expense.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
      if (!expense) return res.status(404).json({ message: 'Expense not found' });
      //revert account balances
      await revertAccountBalances(expense.payments, 'expense');
      res.status(200).json({ message: 'Expense deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };