const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');

const formatCurrency = (amount) => `₹ ${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const formatDate = (date) => new Date(date).toLocaleString('en-IN', { hour12: true });
const getAccountLabel = (account) => account ? `${account.name} - ${account.account_number}` : '-';

exports.getPaymentsAccountReport = async (req, res) => {
  try {
    const { businessLocation, date_from, date_to } = req.query;

    const result = [];

    // Convert string to actual Date objects
    const from = date_from ? new Date(date_from) : null;
    const to = date_to ? new Date(date_to) : null;

    // Filters for base models
    const transactionFilter = { status: { $ne: 'return' } };
    if (businessLocation) transactionFilter.businessLocation = businessLocation;

    // Filters for payments array
    const paymentDateFilter = (paymentDate) => {
      if (!paymentDate) return false;
      const paidDate = new Date(paymentDate);
      if (from && paidDate < from) return false;
      if (to && paidDate > to) return false;
      return true;
    };

    const [sales, purchases, expenses] = await Promise.all([
      Sale.find(transactionFilter).populate('payments.account contact'),
      Purchase.find(transactionFilter).populate('payments.account contact'),
      Expense.find(businessLocation ? { businessLocation } : {}).populate('payments.account contact'),
    ]);

    const pushFormatted = ({
      payment,
      type,
      invoice_no,
      contactName,
      contactType,
      details,
      account
    }) => {
      if (!payment?.account || !paymentDateFilter(payment.paidOn)) return;

      result.push({
        payment_id: payment._id,
        payment_ref_no: payment.paymentRefNo || '',
        paid_on: formatDate(payment.paidOn),
        type,
        invoice_no: invoice_no || '',
        amount: formatCurrency(payment.amount),
        account: getAccountLabel(account),
        account_id: account._id?.toString() || '',
        account_name: account.name || '',
        account_number: account.account_number || '',
        contact_name: contactName || '',
        contact_type: contactType || '',
        details
      });
    };

    sales.forEach((sale) => {
      const contactName = sale.contact?.firstName + ' ' + sale.contact?.lastName || '';
      const contactType = sale.contact?.contactType || 'customer';
      const details = `<b>Customer:</b> ${contactName}`;

      sale.payments?.forEach((payment) =>
        pushFormatted({
          payment,
          type: 'Sell',
          invoice_no: sale.invoiceNo,
          contactName,
          contactType,
          details,
          account: payment.account
        })
      );
    });

    purchases.forEach((purchase) => {
      const contactName = purchase.contact?.firstName + ' ' + purchase.contact?.lastName || '';
      const contactType = purchase.contact?.contactType || 'supplier';
      const details = `<b>Supplier:</b> ${contactName}`;

      purchase.payments?.forEach((payment) =>
        pushFormatted({
          payment,
          type: 'Purchase',
          invoice_no: purchase.referenceNo || purchase.ref_no,
          contactName,
          contactType,
          details,
          account: payment.account
        })
      );
    });

    expenses.forEach((expense) => {
      const contactName = expense.contact?.firstName + ' ' + expense.contact?.lastName || '';
      const contactType = expense.contact?.contactType || 'supplier';
      const details = `<b>Supplier:</b> ${contactName}`;

      expense.payments?.forEach((payment) =>
        pushFormatted({
          payment,
          type: 'Expense',
          invoice_no: expense.referenceNo || expense.ref_no,
          contactName,
          contactType,
          details,
          account: payment.account
        })
      );
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('Error generating payment account report:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
};
