const Expense = require('../../models/expenseModel');

const generateReferenceNo = async () => {
  const count = await Expense.countDocuments();
  return `EXP${new Date().getFullYear()}/${count + 1}`;
};

exports.addExpense = async (req, res) => {
  try {
    const referenceNo = req.body.referenceNo || await generateReferenceNo();
    const expense = new Expense({ ...req.body, referenceNo });
    await expense.save();
    res.status(201).json({ message: 'Expense created successfully', expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};