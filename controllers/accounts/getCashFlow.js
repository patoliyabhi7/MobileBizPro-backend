const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');

exports.getCashFlow = async (req, res) => {
  try {
    let { account_id, location_id, account_type, start_date, end_date } = req.query;
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
        ...(location_id && { businessLocation: location_id }),
        ...({ status: { $ne: 'return' } })
      }),
      Purchase.find({
        ...(location_id && { businessLocation: location_id }),
        ...({ status: { $ne: 'return' } })
      }),
      Expense.find({
        ...(location_id && { businessLocation: location_id })
      }),
    ]);

    // Deposits (IN)
    deposits.forEach(dep => {
      pushEntry({
        date: dep.createdAt,
        description: `Deposit - Ref: ${dep.ref_no || '-'}`,
        method: dep.payment_method || '',
        details: dep.payment_details || '',
        credit: parseFloat(dep.amount),
        debit: 0
      });
    });

    // Fund Transfers
    transfersIn.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Received from A/C ${tr.from_account}`,
        method: tr.payment_method || '',
        details: tr.payment_details || '',
        credit: parseFloat(tr.amount),
        debit: 0
      });
    });

    transfersOut.forEach(tr => {
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Sent to A/C ${tr.to_account}`,
        method: tr.payment_method || '',
        details: tr.payment_details || '',
        credit: 0,
        debit: parseFloat(tr.amount)
      });
    });

    // Sales
    sales.forEach(sale => {
      sale.payments?.forEach(pay => {
        if (!account_id || pay.account == account_id) {
          pushEntry({
            date: sale.saleDate,
            description: `Sale - Invoice: ${sale.invoiceNo || ''}`,
            method: pay.method || '',
            details: pay.note || '',
            credit: parseFloat(pay.amount || 0),
            debit: 0
          });
        }
      });
    });

    // Purchases
    purchases.forEach(pur => {
      pur.payments?.forEach(pay => {
        if (!account_id || pay.account == account_id) {
          pushEntry({
            date: pur.purchaseDate || pur.transaction_date,
            description: `Purchase - Ref: ${pur.referenceNo || pur.ref_no || ''}`,
            method: pay.method || '',
            details: pay.payment_details || '',
            debit: parseFloat(pay.amount || 0),
            credit: 0
          });
        }
      });
    });

    // Expenses
    expenses.forEach(exp => {
      exp.payments?.forEach(pay => {
        if (!account_id || pay.account == account_id) {
          pushEntry({
            date: exp.transactionDate,
            description: `Expense - ${exp.category.name || 'General'}`,
            method: pay.method || '',
            details: pay.payment_details || '',
            credit: 0,
            debit: parseFloat(pay.amount || 0)
          });
        }
      });
    });

    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    const opening_balance = entries.length > 0
      ? parseFloat(entries[0].balance) - (parseFloat(entries[0].credit || 0) - parseFloat(entries[0].debit || 0))
      : 0;

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
