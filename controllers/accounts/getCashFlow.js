const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');

exports.getCashFlow = async (req, res) => {
  try {
    const { account_id, location_id, account_type, start_date, end_date } = req.query;
    if (account_id === 'All') account_id = undefined;
    if (location_id === 'All locations') location_id = undefined;
    if (account_type === 'All') account_type = undefined;
    let runningBalance = 0;
    let totalCredit = 0;
    let totalDebit = 0;
    const entries = [];

    const isInRange = (date) => {
      if (!start_date || !end_date) return true;
      const d = new Date(date);
      return d >= new Date(start_date) && d <= new Date(end_date);
    };

    const pushEntry = ({ date, description, method, details, debit, credit }) => {
      if (!isInRange(date)) return;

      if (credit) {
        runningBalance += credit;
        totalCredit += credit;
      }

      if (debit) {
        runningBalance -= debit;
        totalDebit += debit;
      }

      const transaction_type = credit ? 'credit' : 'debit';
      if (!account_type || transaction_type === account_type) {
        entries.push({
          date,
          description,
          paymentMethod: method || '',
          paymentDetails: details || '',
          debit: debit ? debit.toFixed(2) : '',
          credit: credit ? credit.toFixed(2) : '',
          balance: runningBalance.toFixed(2),
          transaction_type
        });
      }
    };

    // Fetch in parallel
    const [deposits, transfersOut, transfersIn, sales, purchases, expenses] = await Promise.all([
      Deposit.find({
        ...(account_id && { to_account: account_id }),
        ...(location_id && { businessLocation: location_id })
      }),
      FundTransfer.find({
        ...(account_id && { from_account: account_id }),
        ...(location_id && { businessLocation: location_id })
      }),
      FundTransfer.find({
        ...(account_id && { to_account: account_id }),
        ...(location_id && { businessLocation: location_id })
      }),
      Sale.find({
        ...(account_id && { linkedAccount: account_id }),
        ...(location_id && { businessLocation: location_id })
      }),
      Purchase.find({
        ...(account_id && { linkedAccount: account_id }),
        ...(location_id && { businessLocation: location_id })
      }),
      Expense.find({
        ...(account_id && { linkedAccount: account_id }),
        ...(location_id && { businessLocation: location_id })
      }),
    ]);

    // Deposits (IN)
    deposits.forEach(dep => {
      pushEntry({
        date: dep.createdAt,
        description: `Deposit - Ref: ${dep.ref_no || '-'}`,
        method: dep.payment_method,
        details: dep.payment_details,
        credit: parseFloat(dep.amount),
        debit: 0
      });
    });

    // Fund Transfers IN
    transfersIn.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Received from A/C ${tr.from_account}`,
        method: tr.payment_method,
        details: tr.payment_details,
        credit: parseFloat(tr.amount),
        debit: 0
      });
    });

    // Fund Transfers OUT
    transfersOut.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Sent to A/C ${tr.to_account}`,
        method: tr.payment_method,
        details: tr.payment_details,
        credit: 0,
        debit: parseFloat(tr.amount)
      });
    });

    // Sales (IN)
    sales.forEach(sale => {
      pushEntry({
        date: sale.transaction_date,
        description: `Sale - Invoice: ${sale.invoice_no || ''}`,
        method: sale.payment_method || '',
        details: sale.payment_details || '',
        credit: parseFloat(sale.paid_amount || sale.final_total || 0),
        debit: 0
      });
    });

    // Purchases (OUT)
    purchases.forEach(pur => {
      pushEntry({
        date: pur.purchaseDate || pur.transaction_date,
        description: `Purchase - Ref: ${pur.referenceNo || pur.ref_no || ''}`,
        method: pur.payment_method || '',
        details: pur.payment_details || '',
        credit: 0,
        debit: parseFloat(pur.total || 0)
      });
    });

    // Expenses (OUT)
    expenses.forEach(exp => {
      pushEntry({
        date: exp.date,
        description: `Expense - ${exp.expense_category || 'General'}`,
        method: exp.payment_method || '',
        details: exp.payment_details || '',
        credit: 0,
        debit: parseFloat(exp.amount)
      });
    });

    // Sort by date ascending
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    const opening_balance = entries.length > 0 ? parseFloat(entries[0].balance) - (parseFloat(entries[0].credit || 0) - parseFloat(entries[0].debit || 0)) : 0;

    res.status(200).json({
      account_id: account_id || 'All',
      location_id: location_id || 'All locations',
      account_type: account_type || 'All',
      start_date,
      end_date,
      total_credit: totalCredit.toFixed(2),
      total_debit: totalDebit.toFixed(2),
      opening_balance: opening_balance.toFixed(2),
      closing_balance: runningBalance.toFixed(2),
      entries
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
