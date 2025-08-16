const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.addSalePayment = async (req, res) => {
  try {
    const { saleId } = req.params;
    
    // Validate saleId
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      return res.status(400).json({ error: 'Invalid Sale ID format' });
    }

    // Find sale
    const sale = await Sale.findById(saleId);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Format new payment data
    const { payments, paymentStatus, paymentDue } = req.body;
    if (!payments) {
      return res.status(400).json({ error: 'Payment details are required' });
    }
    
    // Revert old payments if they exist (for updating scenario)
    if (sale.payments && sale.payments.length > 0) {
      await revertAccountBalances(sale.payments, 'sale');
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
    const paymentRefNo = await generateAutoId('SALEPYMT');
    
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
    sale.payments = formattedPayments;

    // Use payment status and payment due from frontend
    sale.paymentStatus = paymentStatus;
    sale.paymentDue = paymentDue;

    // Save the sale with new payments
    await sale.save();

    // Update account balances
    await updateAccountBalances(formattedPayments, 'sale');

    // Return updated sale with populated fields
    const updatedSale = await Sale.findById(saleId)
      .populate('customer', 'firstName lastName')
      .populate('businessLocation', 'name')
      .populate('payments.account', 'name accountNumber')
      .populate('payments.method', 'name')
      .populate('addedBy', 'name');

    res.status(200).json({
      message: 'Sale payments updated successfully',
      updatedSale
    });
    
  } catch (err) {
    console.error('Update Sale Payment Error:', err);
    res.status(500).json({ error: err.message });
  }
};
