const Account = require('../../models/accountModel');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');

const getDateRangeMatch = (field, startDate, endDate, locationId) => {
  const filter = {};
  if (startDate && endDate) {
    filter[field] = {
      $gte: new Date(startDate + 'T00:00:00.000Z'),
      $lte: new Date(endDate + 'T23:59:59.999Z')
    };
  } else if (startDate) {
    filter[field] = { $gte: new Date(startDate + 'T00:00:00.000Z') };
  } else if (endDate) {
    filter[field] = { $lte: new Date(endDate + 'T23:59:59.999Z') };
  }

  if (locationId) {
    filter.businessLocation = locationId;
  }

  return filter;
};

exports.getAccountBook = async (req, res) => {
  try {
    const accountId = req.params.id;
    const { startDate, endDate, locationId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const account = await Account.findById(accountId).select('name account_type balance initialBalance');
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const entries = [];

    const formatUser = (user) => ({
      _id: user?._id || '',
      name: user?.name || ''
    });

    const isInDateRange = (date) => {
      const d = new Date(date);
      const start = startDate ? new Date(startDate + 'T00:00:00.000Z') : null;
      const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : null;
      return (!start || d >= start) && (!end || d <= end);
    };

    // Modified pushEntry - NO balance calculation here, just collect entries
    const pushEntry = ({ date, description, method, details, note, addedBy, debit, credit, referenceId, referenceNo }) => {
      entries.push({
        date,
        description,
        paymentMethod: method || '',
        paymentDetails: details || '',
        note: note || '',
        addedBy: formatUser(addedBy),
        debit: parseFloat(debit || 0),
        credit: parseFloat(credit || 0),
        referenceId: referenceId || '',
        referenceNo: referenceNo || '',
        // No balance calculation here - will be done later
      });
    };

    const [
      deposits,
      transfersOut,
      transfersIn,
      sales,
      purchases,
      expenses,
      saleReturns,
      purchaseReturns
    ] = await Promise.all([
      Deposit.find({
        ...getDateRangeMatch('dateTime', startDate, endDate, locationId),
        to_account: accountId
      }).populate('addedBy', 'name'),

      FundTransfer.find({
        ...getDateRangeMatch('dateTime', startDate, endDate, locationId),
        from_account: accountId
      }).populate('addedBy', 'name').populate('to_account', 'name account_number'),

      FundTransfer.find({
        ...getDateRangeMatch('dateTime', startDate, endDate, locationId),
        to_account: accountId
      }).populate('addedBy', 'name').populate('from_account', 'name account_number'),

      Sale.find({
        ...getDateRangeMatch('saleDate', startDate, endDate, locationId),
        'payments.account': accountId,
        isDeleted: { $ne: true }
      }).populate('addedBy', 'name')
        .populate('customer', 'firstName lastName')
        .populate('payments.method', 'name'),

      Purchase.find({
        ...getDateRangeMatch('purchaseDate', startDate, endDate, locationId),
        'payments.account': accountId,
        isDeleted: { $ne: true }
      }).populate('addedBy', 'name')
        .populate('supplier', 'businessName')
        .populate('payments.method', 'name'),

      Expense.find({
        ...getDateRangeMatch('transactionDate', startDate, endDate, locationId),
        'payments.account': accountId,
        isDeleted: { $ne: true }
      }).populate('addedBy', 'name')
        .populate('category', 'name')
        .populate('payments.method', 'name'),

      SaleReturn.find({
        ...getDateRangeMatch('returnDate', startDate, endDate, locationId),
        'returnPayments.account': accountId,
        isDeleted: { $ne: true }
      })
        .populate('addedBy', 'name')
        .populate('returnPayments.method', 'name')
        .populate('originalSale', 'invoiceNo') // populate for reference
        .populate('newPurchase', 'referenceNo'), // populate for reference

      PurchaseReturn.find({
        ...getDateRangeMatch('returnDate', startDate, endDate, locationId),
        'returnPayments.account': accountId,
        isDeleted: { $ne: true }
      })
        .populate('addedBy', 'name')
        .populate('returnPayments.method', 'name')
        .populate('originalPurchase', 'referenceNo'), // populate for reference
    ]);

    // Process Deposits
    deposits.forEach(dep => {
      if (isInDateRange(dep.dateTime)) {
        const description = `Deposit\nRef: ${dep.referenceNo || '-'}\nAdded By: ${dep.addedBy?.name || ''}`;

        pushEntry({
          date: dep.dateTime,
          description,
          method: '',
          details: dep.note || '',
          note: dep.note || '',
          addedBy: dep.addedBy,
          debit: 0,
          credit: parseFloat(dep.amount)
        });
      }
    });

    // Process Fund Transfers Out
    transfersOut.forEach(tr => {
      if (isInDateRange(tr.dateTime)) {
        const toAccountName = tr.to_account?.name || tr.to_account?.account_number || 'Unknown Account';
        const description = `Fund Transfer\nTo Account: ${toAccountName}\nRef: ${tr.referenceNo || '-'}\nAdded By: ${tr.addedBy?.name || ''}`;

        pushEntry({
          date: tr.dateTime,
          description,
          method: '',
          details: tr.note || '',
          note: tr.note || '',
          addedBy: tr.addedBy,
          debit: parseFloat(tr.amount),
          credit: 0
        });
      }
    });

    // Process Fund Transfers In
    transfersIn.forEach(tr => {
      if (isInDateRange(tr.dateTime)) {
        const fromAccountName = tr.from_account?.name || tr.from_account?.account_number || 'Unknown Account';
        const description = `Fund Transfer\nFrom Account: ${fromAccountName}\nRef: ${tr.referenceNo || '-'}\nAdded By: ${tr.addedBy?.name || ''}`;

        pushEntry({
          date: tr.dateTime,
          description,
          method: '',
          details: tr.note || '',
          note: tr.note || '',
          addedBy: tr.addedBy,
          debit: 0,
          credit: parseFloat(tr.amount)
        });
      }
    });

    // Process Sales
    sales.forEach(sale => {
      sale.payments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || sale.saleDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          const customerName = sale.customer?.firstName ?
            `${sale.customer.firstName} ${sale.customer.lastName || ''}`.trim() : 'N/A';
          const description = `Sale\nCustomer: ${customerName}\nReference No: ${sale.invoiceNo || ''}\nInvoice No: ${sale.invoiceNo || ''}\nPay reference no.: ${pmt.paymentRefNo || ''}\nAdded By: ${sale.addedBy?.name || ''}`;
          // Now Reference No is above Pay reference no.
          const methodName = pmt.method?.name || pmt.method || '';
          pushEntry({
            date: paidDate,
            description,
            method: methodName,
            details: pmt.note || '',
            note: sale.additionalNotes || sale.staffNote || '',
            addedBy: sale.addedBy,
            debit: 0,
            credit: parseFloat(pmt.amount || 0),
            referenceId: sale._id,
            referenceNo: sale.invoiceNo || ''
          });
        }
      });
    });

    // Process Purchases
    purchases.forEach(pur => {
      pur.payments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || pur.purchaseDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          const supplierName = pur.supplier?.businessName || 'N/A';
          const description = `Purchase\nSupplier: ${supplierName}\nReference No: ${pur.referenceNo || ''}\nPay reference no.: ${pmt.paymentRefNo || ''}\nAdded By: ${pur.addedBy?.name || ''}`;
          // Reference No above Pay reference no.
          const methodName = pmt.method?.name || pmt.method || '';
          pushEntry({
            date: paidDate,
            description,
            method: methodName,
            details: pmt.note || '',
            note: pur.additionalNotes || '',
            addedBy: pur.addedBy,
            debit: parseFloat(pmt.amount || 0),
            credit: 0,
            referenceId: pur._id,
            referenceNo: pur.referenceNo || ''
          });
        }
      });
    });

    // Process Sale Returns
    saleReturns.forEach(ret => {
      ret.returnPayments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || ret.returnDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          let referenceId = '';
          let referenceNo = '';
          if (ret.newPurchase) {
            referenceId = ret.newPurchase._id || ret.newPurchase;
            referenceNo = ret.newPurchase.referenceNo || '';
          } else if (ret.originalSale) {
            referenceId = ret.originalSale._id || ret.originalSale;
            referenceNo = ret.originalSale.invoiceNo || '';
          }
          const description = `Sale Return\nReference No: ${referenceNo}\nRef: ${ret.referenceNo || ''}\nPay reference no.: ${pmt.paymentRefNo || ''}\nAdded By: ${ret.addedBy?.name || ''}`;
          // Reference No above Pay reference no.
          const methodName = pmt.method?.name || pmt.method || '';
          pushEntry({
            date: paidDate,
            description,
            method: methodName,
            details: pmt.note || '',
            note: '',
            addedBy: ret.addedBy,
            debit: parseFloat(pmt.amount || 0),
            credit: 0,
            referenceId,
            referenceNo
          });
        }
      });
    });

    // Process Purchase Returns
    purchaseReturns.forEach(ret => {
      ret.returnPayments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || ret.returnDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          let referenceId = '';
          let referenceNo = '';
          if (ret.originalPurchase) {
            referenceId = ret.originalPurchase._id || ret.originalPurchase;
            referenceNo = ret.originalPurchase.referenceNo || '';
          }
          const description = `Purchase Return\nReference No: ${referenceNo}\nRef: ${ret.referenceNo || ''}\nPay reference no.: ${pmt.paymentRefNo || ''}\nAdded By: ${ret.addedBy?.name || ''}`;
          // Reference No above Pay reference no.
          const methodName = pmt.method?.name || pmt.method || '';
          pushEntry({
            date: paidDate,
            description,
            method: methodName,
            details: pmt.note || '',
            note: '',
            addedBy: ret.addedBy,
            debit: 0,
            credit: parseFloat(pmt.amount || 0),
            referenceId,
            referenceNo
          });
        }
      });
    });

    // STEP 1: Sort entries chronologically (oldest first)
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // STEP 2: Calculate running balance starting with initialBalance
    let runningBalance = parseFloat(account.initialBalance || 0);
    let totalDebit = 0;
    let totalCredit = 0;

    entries.forEach(entry => {
      // Update totals
      totalCredit += entry.credit;
      totalDebit += entry.debit;

      // Calculate new running balance
      runningBalance += entry.credit - entry.debit;

      // Store the balance after this transaction
      entry.balance = parseFloat(runningBalance.toFixed(2));

      // Format the amounts for display
      entry.debit = entry.debit ? parseFloat(entry.debit.toFixed(2)) : 0;
      entry.credit = entry.credit ? parseFloat(entry.credit.toFixed(2)) : 0;
    });

    // Calculate opening balance (initialBalance)
    const openingBalance = parseFloat(account.initialBalance || 0);

    // STEP 3: Sort entries by date (newest first) for display
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({
      accountId,
      accountName: account.name,
      accountType: account.account_type,
      openingBalance: parseFloat(openingBalance.toFixed(2)),
      totalDebit: parseFloat(totalDebit.toFixed(2)),
      totalCredit: parseFloat(totalCredit.toFixed(2)),
      closingBalance: parseFloat(runningBalance.toFixed(2)),
      accountBalance: parseFloat((account.balance || 0).toFixed(2)),
      startDate,
      endDate,
      locationId: locationId || 'All locations',
      entries
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};