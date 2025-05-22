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

    // Helper to push a standardized entry
    const pushEntry = ({ date, description, method, details, note, addedBy, debit, credit }) => {
      if (credit) runningBalance += credit;
      if (debit) runningBalance -= debit;

      entries.push({
        date,
        description,
        paymentMethod: method || '',
        paymentDetails: details || '',
        note: note || '',
        addedBy: addedBy || '',
        debit: debit ? debit.toFixed(2) : '',
        credit: credit ? credit.toFixed(2) : '',
        balance: runningBalance.toFixed(2),
      });
    };

    // Fetch all records in parallel
    const [deposits, transfersOut, transfersIn, sales, purchases, expenses] = await Promise.all([
      Deposit.find({ to_account: accountId }),
      FundTransfer.find({ from_account: accountId }),
      FundTransfer.find({ to_account: accountId }),
      Sale.find({ linkedAccount: accountId }),
      Purchase.find({ linkedAccount: accountId }),
      Expense.find({ linkedAccount: accountId })
    ]);

    // Map deposits
    deposits.forEach(dep => {
      pushEntry({
        date: dep.createdAt,
        description: `Deposit - Ref: ${dep.ref_no || '-'}`,
        method: dep.payment_method,
        details: dep.payment_details,
        note: dep.note,
        addedBy: dep.added_by,
        debit: 0,
        credit: parseFloat(dep.amount)
      });
    });

    // Map fund transfers IN
    transfersIn.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Received from Account ID ${tr.from_account}`,
        method: tr.payment_method,
        details: tr.payment_details,
        note: tr.note,
        addedBy: tr.added_by,
        debit: 0,
        credit: parseFloat(tr.amount)
      });
    });

    // Map fund transfers OUT
    transfersOut.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Sent to Account ID ${tr.to_account}`,
        method: tr.payment_method,
        details: tr.payment_details,
        note: tr.note,
        addedBy: tr.added_by,
        debit: parseFloat(tr.amount),
        credit: 0
      });
    });

    // Map sales (money comes IN)
    sales.forEach(sale => {
      pushEntry({
        date: sale.transaction_date,
        description: `Sale - Invoice: ${sale.invoice_no || ''}`,
        method: sale.payment_method || '',
        details: sale.payment_details || '',
        note: sale.note || sale.additional_notes || '',
        addedBy: sale.added_by,
        debit: 0,
        credit: parseFloat(sale.paid_amount || sale.final_total || 0)
      });
    });

    // Map purchases (money goes OUT)
    purchases.forEach(pur => {
      pushEntry({
        date: pur.transaction_date,
        description: `Purchase - Ref: ${pur.ref_no || ''}`,
        method: pur.payment_method || '',
        details: pur.payment_details || '',
        note: pur.note,
        addedBy: pur.added_by,
        debit: parseFloat(pur.total || 0),
        credit: 0
      });
    });

    // Map expenses (money goes OUT)
    expenses.forEach(exp => {
      pushEntry({
        date: exp.date,
        description: `Expense - ${exp.expense_category || 'General'}`,
        method: exp.payment_method || '',
        details: exp.payment_details || '',
        note: exp.note,
        addedBy: exp.added_by,
        debit: parseFloat(exp.amount),
        credit: 0
      });
    });

    // Sort all entries by date (latest first)
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({ accountId, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// exports.getAccountBook = async (req, res) => {
//   try {
//     const accountId = req.params.id;

//     const deposits = await Deposit.find({ to_account: accountId });
//     const transfersOut = await FundTransfer.find({ from_account: accountId });
//     const transfersIn = await FundTransfer.find({ to_account: accountId });

//     const linkedSales = await Sale.find({ linkedAccount: accountId });
//     const linkedPurchases = await Purchase.find({ linkedAccount: accountId });
//     const linkedExpenses = await Expense.find({ linkedAccount: accountId });

//     res.status(200).json({
//       deposits,
//       transfersIn,
//       transfersOut,
//       linkedSales,
//       linkedPurchases,
//       linkedExpenses
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
