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
      Sale.find({
        ...(location_id ? { businessLocation: location_id } : {}),
        isDeleted: { $ne: true }
      }).populate('addedBy customer payments.account payments.method'),
      Purchase.find({
        ...(location_id ? { businessLocation: location_id } : {}),
        isDeleted: { $ne: true }
      }).populate('addedBy supplier payments.account payments.method'),
      Expense.find({
        ...(location_id ? { businessLocation: location_id } : {}),
        isDeleted: { $ne: true }
      }).populate('payments.account payments.method category'),
      SaleReturn.find({
        ...(location_id ? { businessLocation: location_id } : {}),
        isDeleted: { $ne: true }
      }).populate('addedBy returnPayments.account returnPayments.method originalSale'),
      PurchaseReturn.find({
        ...(location_id ? { businessLocation: location_id } : {}),
        isDeleted: { $ne: true }
      }).populate('addedBy returnPayments.account returnPayments.method originalPurchase'),
    ]);

    const entries = [];

    const pushEntry = ({ date, description, method, details, debit, credit, accountId, accountName, isInternal = false, excludeFromTotals = false }) => {
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
        excludeFromTotals, // New flag to exclude from total calculations
        balance: 0, // Will be calculated later
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

    // Fund Transfers - FIXED LOGIC
    fundTransfers.forEach(tr => {
      const fromAccId = tr.from_account?._id?.toString();
      const toAccId = tr.to_account?._id?.toString();
      const fromAccName = tr.from_account?.name || tr.from_account?.accountNumber || 'N/A';
      const toAccName = tr.to_account?.name || tr.to_account?.accountNumber || 'N/A';
    
      if (account_id) {
        // When filtering by specific account, show fund transfers normally
        // Show transfer IN (credit) when money comes to selected account
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
            isInternal: false,
            excludeFromTotals: false,
          });
        }
        
        // Show transfer OUT (debit) when money goes from selected account
        if (fromAccId === account_id) {
          pushEntry({
            date: tr.dateTime,
            description: `Fund Transfer Sent to A/C ${toAccName}\nRef: ${tr.referenceNo || '-'}`,
            method: tr.payment_method || '',
            details: tr.payment_details || '',
            credit: 0,
            debit: parseFloat(tr.amount),
            accountId: fromAccId,
            accountName: fromAccName,
            isInternal: false,
            excludeFromTotals: false,
          });
        }
      } else {
        // When showing all accounts, mark fund transfers to exclude from totals
        // but still show them in the report for transparency
        
        // Credit entry (money received)
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
          excludeFromTotals: false, // Include in total credit calculations
        });
        
        // Debit entry (money sent)
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
          excludeFromTotals: false, // Include in total debit calculations
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

    // Fetch account initial balances
    const accountInitialBalances = {};
    const accountCurrentBalances = {};
    
    if (account_id) {
      const acc = await Account.findById(account_id);
      if (acc) {
        accountInitialBalances[account_id] = parseFloat(acc.initialBalance || 0);
        accountCurrentBalances[account_id] = parseFloat(acc.balance || 0);
      }
    } else {
      const accounts = await Account.find({ is_active: true });
      accounts.forEach(acc => {
        const accId = acc._id.toString();
        accountInitialBalances[accId] = parseFloat(acc.initialBalance || 0);
        accountCurrentBalances[accId] = parseFloat(acc.balance || 0);
      });
    }

    // Sort by date (ascending for processing) and then by account
    entries.sort((a, b) => {
      const dateCompare = new Date(a.date) - new Date(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.accountId.localeCompare(b.accountId);
    });

    // Calculate running balances for each account
    const accountRunningBalances = {};
    
    // Initialize running balances with initial balances
    Object.keys(accountInitialBalances).forEach(accId => {
      accountRunningBalances[accId] = accountInitialBalances[accId];
    });

    entries.forEach((entry) => {
      const accId = entry.accountId;
      
      // Initialize if not exists
      if (accountRunningBalances[accId] === undefined) {
        accountRunningBalances[accId] = accountInitialBalances[accId] || 0;
      }
      
      // Calculate new running balance
      // For individual account view, include all transactions
      // For all accounts view, exclude internal fund transfers from running balance
      if (account_id || !entry.excludeFromTotals) {
        accountRunningBalances[accId] += entry.credit - entry.debit;
      }
      
      // Store the balance after this transaction
      entry.balance = parseFloat(accountRunningBalances[accId].toFixed(2));
    });

    // Calculate totals - EXCLUDE fund transfers when viewing all accounts
    let totalCredit = 0;
    let totalDebit = 0;

    entries.forEach((entry) => {
      // Only include in totals if not marked as excludeFromTotals
      if (!entry.excludeFromTotals) {
        totalCredit += entry.credit;
        totalDebit += entry.debit;
      }
    });

    // Determine opening and closing balances
    let opening_balance = 0;
    let closing_balance = 0;
    
    if (account_id) {
      opening_balance = accountInitialBalances[account_id] || 0;
      closing_balance = accountCurrentBalances[account_id] || 0;
    } else {
      opening_balance = Object.values(accountInitialBalances).reduce((sum, bal) => sum + bal, 0);
      closing_balance = Object.values(accountCurrentBalances).reduce((sum, bal) => sum + bal, 0);
    }

    // Sort final entries for response (descending by date)
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Filter final entries
    const finalEntries = entries.filter(entry => {
      if (account_id) {
        // When filtering by account, show all entries for that account
        return entry.accountId === account_id;
      }
      // When showing all accounts, show all entries (including internal transfers for transparency)
      // The excludeFromTotals flag handles the balance calculation issue
      return true;
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