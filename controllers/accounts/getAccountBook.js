const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');

exports.getAccountBook = async (req, res) => {
  try {
    const accountId = req.params.id;
    let runningBalance = 0;
    const entries = [];

    const formatUser = (user) => ({
      _id: user?._id || '',
      name: user?.name || ''
    });

    const pushEntry = ({ date, description, method, details, note, addedBy, debit, credit }) => {
      if (credit) runningBalance += credit;
      if (debit) runningBalance -= debit;

      entries.push({
        date,
        description,
        paymentMethod: method || '',
        paymentDetails: details || '',
        note: note || '',
        addedBy: formatUser(addedBy),
        debit: debit ? debit.toFixed(2) : '',
        credit: credit ? credit.toFixed(2) : '',
        balance: runningBalance.toFixed(2),
      });
    };

    const [deposits, transfersOut, transfersIn, sales, purchases, expenses] = await Promise.all([
      Deposit.find({ to_account: accountId }).populate('addedBy', 'name'),
      FundTransfer.find({ from_account: accountId }).populate('addedBy', 'name'),
      FundTransfer.find({ to_account: accountId }).populate('addedBy', 'name'),
      Sale.find({ status: { $ne: 'return' } }).populate('addedBy', 'name'),
      Purchase.find({ status: { $ne: 'return' } }).populate('addedBy', 'name'),
      Expense.find({}).populate('addedBy', 'name'),
    ]);

    // Deposits (money IN)
    deposits.forEach(dep => {
      pushEntry({
        date: dep.createdAt,
        description: `Deposit - Ref: ${dep.ref_no || '-'}`,
        method: dep.payment_method || '',
        details: dep.payment_details || '',
        note: dep.note || '',
        addedBy: dep.addedBy,
        debit: 0,
        credit: parseFloat(dep.amount)
      });
    });

    // Fund Transfers Received (money IN)
    transfersIn.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Received from Account ID ${tr.from_account}`,
        method: tr.payment_method || '',
        details: tr.payment_details || '',
        note: tr.note || '',
        addedBy: tr.addedBy,
        debit: 0,
        credit: parseFloat(tr.amount)
      });
    });

    // Fund Transfers Sent (money OUT)
    transfersOut.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Sent to Account ID ${tr.to_account}`,
        method: tr.payment_method || '',
        details: tr.payment_details || '',
        note: tr.note || '',
        addedBy: tr.addedBy,
        debit: parseFloat(tr.amount),
        credit: 0
      });
    });

    // Sales (money IN via payments) — only non-returns
    sales.forEach(sale => {
      if (Array.isArray(sale.payments)) {
        sale.payments.forEach(pmt => {
          if (pmt.account?.toString() === accountId) {
            pushEntry({
              date: new Date(pmt.paidOn || sale.transaction_date),
              description: `Sale - Invoice: ${sale.invoice_no || ''}`,
              method: pmt.method || '',
              details: pmt.note || '',
              note: sale.note || sale.additional_notes || '',
              addedBy: sale.addedBy,
              debit: 0,
              credit: parseFloat(pmt.amount || 0)
            });
          }
        });
      }
    });

    // Purchases (money OUT via payments) — only non-returns
    purchases.forEach(pur => {
      if (Array.isArray(pur.payments)) {
        pur.payments.forEach(pmt => {
          if (pmt.account?.toString() === accountId) {
            pushEntry({
              date: new Date(pmt.paidOn || pur.purchaseDate || pur.transaction_date),
              description: `Purchase - Ref: ${pur.referenceNo || pur.ref_no || ''}`,
              method: pmt.method || '',
              details: pmt.note || '',
              note: pur.note || pur.additionalNotes || '',
              addedBy: pur.addedBy,
              debit: parseFloat(pmt.amount || 0),
              credit: 0
            });
          }
        });
      }
    });

    // Expenses (money OUT via payments)
    expenses.forEach(expense => {
      if (Array.isArray(expense.payments)) {
        expense.payments.forEach(pmt => {
          if (pmt.account?.toString() === accountId) {
            pushEntry({
              date: new Date(pmt.paidOn || expense.date),
              description: `Expense - ${expense.expense_category || 'General'}`,
              method: pmt.method || '',
              details: pmt.note || '',
              note: expense.note || '',
              addedBy: expense.addedBy,
              debit: parseFloat(pmt.amount || 0),
              credit: 0
            });
          }
        });
      }
    });

    // Sort entries by date (latest first)
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({ accountId, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
