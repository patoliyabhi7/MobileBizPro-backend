const Expense = require('../../models/expenseModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addExpense = async (req, res) => {
  try {
    req.body.addedBy = req.user.userId;
    const referenceNo = req.body.referenceNo || await generateAutoId('EXP');
    const filePaths = req.files?.map(file => `uploads/${file.filename}`) || [];
    ['expenseFor', 'expenseForContact'].forEach(field => {
      if (req.body[field] === '') {
        delete req.body[field];
      }
    });
    // If payments are sent as JSON string (common in multipart form-data), parse them
    let payments = [];
    if (req.body.payments) {
      if (typeof req.body.payments === 'string') {
        try {
          payments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        payments = req.body.payments;
      }

      let paymentRefNo = await generateAutoId('EXPPYMNT');
    
      // Format date fields
      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: paymentRefNo
      }));
    }
    const expense = new Expense({ ...req.body, referenceNo, documents: filePaths, payments });
    await expense.save();
    if (expense.payments && expense.payments.length > 0) {
      await updateAccountBalances(expense.payments, 'expense');
    }
    const populatedExpense = await Expense.findById(expense._id).populate('category').populate('businessLocation').populate('expenseFor').populate('expenseForContact').populate('payments.account').populate('addedBy', 'name _id');
    res.status(201).json({ message: 'Expense created successfully', populatedExpense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};