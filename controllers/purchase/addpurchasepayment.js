const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.addPurchasePayment = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    
    // Validate purchaseId
    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      return res.status(400).json({ error: 'Invalid Purchase ID format' });
    }

    // Find purchase
    const purchase = await Purchase.findById(purchaseId);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Format new payment data
    const { payments, paymentStatus, paymentDue } = req.body;
    if (!payments) {
      return res.status(400).json({ error: 'Payment details are required' });
    }
    
    // Revert old payments if they exist (for updating scenario)
    if (purchase.payments && purchase.payments.length > 0) {
      await revertAccountBalances(purchase.payments, 'purchase');
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
    const paymentRefNo = await generateAutoId('PURPYMT');
    
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
    purchase.payments = formattedPayments;

    // Use payment status and payment due from frontend
    purchase.paymentStatus = paymentStatus;
    purchase.paymentDue = paymentDue;

    // Save the purchase with new payments
    await purchase.save();

    // Update account balances
    await updateAccountBalances(formattedPayments, 'purchase');

    // Return updated purchase with populated fields
    const updatedPurchase = await Purchase.findById(purchaseId)
      .populate('supplier', 'firstName lastName')
      .populate('businessLocation', 'name')
      .populate('payments.account', 'name accountNumber')
      .populate('payments.method', 'name')
      .populate('addedBy', 'name');

    res.status(200).json({
      message: 'Purchase payments updated successfully',
      updatedPurchase
    });
    
  } catch (err) {
    console.error('Update Purchase Payment Error:', err);
    res.status(500).json({ error: err.message });
  }
};
