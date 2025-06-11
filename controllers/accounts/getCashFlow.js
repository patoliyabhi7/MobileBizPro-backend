const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const Account = require('../../models/accountModel');

exports.getCashFlow = async (req, res) => {
  try {
    let { account_id, location_id, account_type, start_date, end_date } = req.query;

    if (!account_id || account_id === 'All') account_id = undefined;
    if (!location_id || location_id === 'All locations') location_id = undefined;
    if (!account_type || account_type === 'All') account_type = undefined;

    const isInRange = (date) => {
      if (!start_date || !end_date) return true;
      const d = new Date(date);
      const start = new Date(start_date);
      const end = new Date(new Date(end_date).setHours(23, 59, 59, 999));
      return d >= start && d <= end;
    };

    const [
      deposits, fundTransfers, sales, purchases,
      expenses, saleReturns, purchaseReturns
    ] = await Promise.all([
      Deposit.find(location_id ? { businessLocation: location_id } : {}).populate('to_account'),
      FundTransfer.find(location_id ? { businessLocation: location_id } : {}).populate('from_account to_account'),
      Sale.find(location_id ? { businessLocation: location_id } : {}).populate('addedBy customer payments.account payments.method'),
      Purchase.find(location_id ? { businessLocation: location_id } : {}).populate('addedBy supplier payments.account payments.method'),
      Expense.find(location_id ? { businessLocation: location_id } : {}).populate('payments.account payments.method category'),
      SaleReturn.find(location_id ? { businessLocation: location_id } : {}).populate('addedBy returnPayments.account returnPayments.method originalSale'),
      PurchaseReturn.find(location_id ? { businessLocation: location_id } : {}).populate('addedBy returnPayments.account returnPayments.method originalPurchase'),
    ]);

    const entries = [];

    const pushEntry = ({ date, description, method, details, debit, credit, accountId, accountName, isInternal = false }) => {
      if (!isInRange(date)) return;
      const transaction_type = credit > 0 ? 'credit' : 'debit';
      if (account_type && transaction_type !== account_type) return;

      entries.push({
        date,
        account: accountName,
        accountId: accountId || accountName,
        description,
        paymentMethod: method || '',
        paymentDetails: details || '',
        debit: parseFloat(debit || 0),
        credit: parseFloat(credit || 0),
        transaction_type,
        isInternal,
        balance: 0, // Will be filled later with actual account balance
      });
    };

    // Deposits
    deposits.forEach(dep => {
      if (!account_id || (dep.to_account && dep.to_account._id.toString() === account_id)) {
        pushEntry({
          date: dep.dateTime,
          description: `Deposit - Ref: ${dep.referenceNo || '-'}`,
          method: dep.payment_method || '',
          details: dep.payment_details || '',
          credit: parseFloat(dep.amount),
          debit: 0,
          accountId: dep.to_account?._id?.toString(),
          accountName: dep.to_account?.name || dep.to_account?.accountNumber || 'N/A',
        });
      }
    });

    // Fund Transfers
    fundTransfers.forEach(tr => {
      const fromAccId = tr.from_account?._id?.toString();
      const toAccId = tr.to_account?._id?.toString();
      const fromAccName = tr.from_account?.name || tr.from_account?.accountNumber || 'N/A';
      const toAccName = tr.to_account?.name || tr.to_account?.accountNumber || 'N/A';

      if (account_id) {
        if (toAccId === account_id) {
          pushEntry({
            date: tr.dateTime,
            description: `Fund Transfer Received from A/C ${fromAccName}\nRef: ${tr.referenceNo || '-'}`,
            method: tr.payment_method || '',
            details: tr.payment_details || '',
            credit: parseFloat(tr.amount),
            debit: 0,
            accountId: toAccId,
            accountName: toAccName,
          });
        } else if (fromAccId === account_id) {
          pushEntry({
            date: tr.dateTime,
            description: `Fund Transfer Sent to A/C ${toAccName}\nRef: ${tr.referenceNo || '-'}`,
            method: tr.payment_method || '',
            details: tr.payment_details || '',
            credit: 0,
            debit: parseFloat(tr.amount),
            accountId: fromAccId,
            accountName: fromAccName,
          });
        }
      } else {
        pushEntry({
          date: tr.dateTime,
          description: `Fund Transfer Received from A/C ${fromAccName}\nRef: ${tr.referenceNo || '-'}`,
          method: tr.payment_method || '',
          details: tr.payment_details || '',
          credit: parseFloat(tr.amount),
          debit: 0,
          accountId: toAccId,
          accountName: toAccName,
          isInternal: true,
        });
        pushEntry({
          date: tr.dateTime,
          description: `Fund Transfer Sent to A/C ${toAccName}\nRef: ${tr.referenceNo || '-'}`,
          method: tr.payment_method || '',
          details: tr.payment_details || '',
          credit: 0,
          debit: parseFloat(tr.amount),
          accountId: fromAccId,
          accountName: fromAccName,
          isInternal: true,
        });
      }
    });

    // Sales
    for (const sale of sales) {
      for (const pay of sale.payments || []) {
        const accId = pay.account?._id?.toString();
        if (!account_id || accId === account_id) {
          pushEntry({
            date: pay.paidOn || sale.saleDate,
            description: `Sell\nCustomer: ${sale.customer?.firstName || ''} ${sale.customer?.lastName || ''}\nInvoice No.: ${sale.invoiceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${sale.addedBy?.name || ''}`,
            method: pay.method?.name || '',
            details: pay.note || '',
            credit: parseFloat(pay.amount || 0),
            debit: 0,
            accountId: accId,
            accountName: pay.account?.name || pay.account?.accountNumber || 'N/A',
          });
        }
      }
    }

    // Purchases
    for (const pur of purchases) {
      for (const pay of pur.payments || []) {
        const accId = pay.account?._id?.toString();
        if (!account_id || accId === account_id) {
          pushEntry({
            date: pay.paidOn || pur.purchaseDate,
            description: `Purchase\nSupplier: ${pur.supplier?.businessName || ''}\nRef: ${pur.referenceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${pur.addedBy?.name || ''}`,
            method: pay.method?.name || '',
            details: pay.note || '',
            credit: 0,
            debit: parseFloat(pay.amount || 0),
            accountId: accId,
            accountName: pay.account?.name || pay.account?.accountNumber || 'N/A',
          });
        }
      }
    }

    // Expenses
    expenses.forEach(exp => {
      exp.payments?.forEach(pay => {
        const accId = pay.account?._id?.toString();
        if (!account_id || accId === account_id) {
          pushEntry({
            date: pay.paidOn || exp.transactionDate,
            description: `Expense - ${exp.category?.name || 'General'}`,
            method: pay.method?.name || '',
            details: pay.payment_details || '',
            credit: 0,
            debit: parseFloat(pay.amount || 0),
            accountId: accId,
            accountName: pay.account?.name || pay.account?.accountNumber || 'N/A',
          });
        }
      });
    });

    // Sale Returns
    saleReturns.forEach(ret => {
      ret.returnPayments?.forEach(pay => {
        const accId = pay.account?._id?.toString();
        if (!account_id || accId === account_id) {
          pushEntry({
            date: pay.paidOn || ret.returnDate,
            description: `Sale Return\nRef: ${ret.referenceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${ret.addedBy?.name || ''}`,
            method: pay.method?.name || '',
            details: pay.note || '',
            credit: 0,
            debit: parseFloat(pay.amount || 0),
            accountId: accId,
            accountName: pay.account?.name || pay.account?.accountNumber || 'N/A',
          });
        }
      });
    });

    // Purchase Returns
    purchaseReturns.forEach(ret => {
      ret.returnPayments?.forEach(pay => {
        const accId = pay.account?._id?.toString();
        if (!account_id || accId === account_id) {
          pushEntry({
            date: pay.paidOn || ret.returnDate,
            description: `Purchase Return\nRef: ${ret.referenceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${ret.addedBy?.name || ''}`,
            method: pay.method?.name || '',
            details: pay.note || '',
            credit: parseFloat(pay.amount || 0),
            debit: 0,
            accountId: accId,
            accountName: pay.account?.name || pay.account?.accountNumber || 'N/A',
          });
        }
      });
    });

    // Sort by date (ascending for processing)
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let totalCredit = 0;
    let totalDebit = 0;

    entries.forEach((entry) => {
      totalCredit += entry.credit;
      totalDebit += entry.debit;
    });

    // Fetch actual account balances from DB
    const accountBalances = {};
    if (account_id) {
      const acc = await Account.findById(account_id);
      accountBalances[account_id] = acc?.balance || 0;
    } else {
      const accounts = await Account.find({});
      accounts.forEach(acc => {
        accountBalances[acc._id.toString()] = acc.balance || 0;
      });
    }

    // Assign current account balance (not running balance)
    entries.forEach(entry => {
      entry.balance = parseFloat(accountBalances[entry.accountId] || 0);
    });

    // Determine final balances
    let opening_balance = 0;
    let closing_balance = 0;
    if (account_id && accountBalances[account_id] !== undefined) {
      closing_balance = parseFloat(accountBalances[account_id].toFixed(2));
    } else {
      closing_balance = Object.values(accountBalances).reduce((sum, bal) => sum + bal, 0);
    }

    // Sort final entries for response (descending)
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    const finalEntries = entries.filter(entry => {
      if (account_id) {
        return entry.accountId === account_id;
      }
      return !entry.isInternal;
    });

    res.status(200).json({
      account_id: account_id || 'All',
      location_id: location_id || 'All locations',
      account_type: account_type || 'All',
      start_date,
      end_date,
      total_credit: parseFloat(totalCredit.toFixed(2)),
      total_debit: parseFloat(totalDebit.toFixed(2)),
      opening_balance: parseFloat(opening_balance.toFixed(2)),
      closing_balance: parseFloat(closing_balance.toFixed(2)),
      entries: finalEntries,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
