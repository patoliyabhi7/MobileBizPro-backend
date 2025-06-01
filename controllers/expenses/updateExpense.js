const Expense = require('../../models/expenseModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const generateAutoId = require('../../utils/generateAutoId');

exports.updateExpense = async (req, res) => {
  try {
    ['expenseFor', 'expenseForContact'].forEach(field => {
      if (req.body[field] === '') {
        delete req.body[field];
      }
    });
    // Step 1: Fetch the old expense
    const oldExpense = await Expense.findById(req.params.id);
    if (!oldExpense || oldExpense.isDeleted) {
      return res.status(404).json({ message: 'Expense not found or deleted' });
    }

    // Step 2: Handle documents
    if (req.files && req.files.length > 0) {
      // Delete old files
      if (oldExpense.documents && oldExpense.documents.length > 0) {
        oldExpense.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }

      // Assign new file paths
      req.body.documents = req.files.map(file => `uploads/${file.filename}`);
    }

    // Step 3: Parse and format payments
    if ('payments' in req.body) {
      let payments = [];

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

      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: paymentRefNo
      }));

      req.body.payments = payments;
    }

    req.body.addedBy = req.user.userId;

    // Step 4: Revert old balances
    await revertAccountBalances(oldExpense.payments, 'expense');

    // Step 5: Update the expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('category').populate('businessLocation').populate('expenseFor').populate('expenseForContact').populate('payments.account').populate('addedBy', 'name _id');

    if (!updatedExpense) {
      return res.status(404).json({ message: 'Expense not found after update' });
    }

    // Step 6: Update new balances
    if (req.body.payments && req.body.payments.length > 0) {
      await updateAccountBalances(req.body.payments, 'expense');
    }

    res.status(200).json(updatedExpense);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
