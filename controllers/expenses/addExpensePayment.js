const mongoose = require('mongoose');
const Expense = require('../../models/expenseModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.addExpensePayment = async (req, res) => {
  try {
    const { expenseId } = req.params;
    
    // Validate expenseId
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({ error: 'Invalid Expense ID format' });
    }

    // Find expense
    const expense = await Expense.findById(expenseId);
    if (!expense || expense.isDeleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Format new payment data
    const { payments, paymentStatus, paymentDue } = req.body;
    if (!payments) {
      return res.status(400).json({ error: 'Payment details are required' });
    }
    
    // Revert old payments if they exist (for updating scenario)
    if (expense.payments && expense.payments.length > 0) {
      await revertAccountBalances(expense.payments, 'expense');
    }

    // Format new payments array
    let newPayments = Array.isArray(payments) ? payments : [payments];
    
    // Validate required payment fields for each payment
    for (const payment of newPayments) {
      if (!payment.amount || !payment.paidOn || !payment.method || !payment.account) {
        return res.status(400).json({ 
          error: 'Payment amount, date, method, and account are required for all payments' 
        });
      }
    }

    // Generate a new payment reference number
    const paymentRefNo = await generateAutoId('EXPPYMT');
    
    // Format payment objects
    const formattedPayments = newPayments.map(payment => ({
      amount: Number(payment.amount),
      paidOn: new Date(payment.paidOn),
      method: payment.method,
      account: payment.account,
      paymentRefNo: payment.paymentRefNo || paymentRefNo,
      bankAccountNo: payment.bankAccountNo || '',
      note: payment.note || ''
    }));

    // Replace or add payments based on scenario
    expense.payments = formattedPayments;

    // Use payment status and payment due from frontend
    expense.paymentStatus = paymentStatus;
    expense.paymentDue = paymentDue;

    // Save the expense with new payments
    await expense.save();

    // Update account balances
    await updateAccountBalances(formattedPayments, 'expense');

    // Return updated expense with populated fields
    const updatedExpense = await Expense.findById(expenseId)
      .populate('category', 'name')
      .populate('businessLocation', 'name')
      .populate('expenseFor', 'name')
      .populate('expenseForContact', 'firstName lastName')
      .populate('payments.account', 'name accountNumber')
      .populate('payments.method', 'name')
      .populate('addedBy', 'name');

    res.status(200).json({
      message: 'Expense payments updated successfully',
      updatedExpense
    });
    
  } catch (err) {
    console.error('Update Expense Payment Error:', err);
    res.status(500).json({ error: err.message });
  }
};
