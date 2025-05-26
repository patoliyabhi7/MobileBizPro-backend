const Expense = require('../../models/expenseModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.addExpense = async (req, res) => {
  try {
    req.body.addedBy = req.user.userId;
    const referenceNo = req.body.referenceNo || await generateAutoId('EXP');
    const filePaths = req.files?.map(file => `uploads/${file.filename}`) || [];
    const expense = new Expense({ ...req.body, referenceNo, documents: filePaths });
    await expense.save();
    const populatedExpense = await Expense.findById(expense._id).populate('linkedAccount').populate('addedBy', 'name _id');
    res.status(201).json({ message: 'Expense created successfully', populatedExpense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};