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

    const account = await Account.findById(accountId).select('name type');
    if (!account) return res.status(404).json({ error: 'Account not found' });

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
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

    const pushEntry = ({ date, description, method, details, note, addedBy, debit, credit }) => {
      if (credit) {
        runningBalance += credit;
        totalCredit += credit;
      }
      if (debit) {
        runningBalance -= debit;
        totalDebit += debit;
      }

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
      Deposit.find({ ...getDateRangeMatch('createdAt', startDate, endDate, locationId), to_account: accountId }).populate('addedBy', 'name'),
      FundTransfer.find({ ...getDateRangeMatch('createdAt', startDate, endDate, locationId), from_account: accountId }).populate('addedBy', 'name'),
      FundTransfer.find({ ...getDateRangeMatch('createdAt', startDate, endDate, locationId), to_account: accountId }).populate('addedBy', 'name'),
      Sale.find({ ...getDateRangeMatch('saleDate', startDate, endDate, locationId), 'payments.account': accountId }).populate('addedBy', 'name'),
      Purchase.find({ ...getDateRangeMatch('purchaseDate', startDate, endDate, locationId), 'payments.account': accountId }).populate('addedBy', 'name'),
      Expense.find({ ...getDateRangeMatch('transactionDate', startDate, endDate, locationId), 'payments.account': accountId }).populate('addedBy', 'name'),
      SaleReturn.find({ ...getDateRangeMatch('returnDate', startDate, endDate, locationId), 'returnPayments.account': accountId }).populate('addedBy', 'name'),
      PurchaseReturn.find({ ...getDateRangeMatch('returnDate', startDate, endDate, locationId), 'returnPayments.account': accountId }).populate('addedBy', 'name'),
    ]);

    deposits.forEach(dep => {
      if (isInDateRange(dep.createdAt)) {
        pushEntry({
          date: dep.createdAt,
          description: `Deposit`,
          method: '',
          details: '',
          note: dep.note || '',
          addedBy: dep.addedBy,
          debit: 0,
          credit: parseFloat(dep.amount)
        });
      }
    });

    transfersOut.forEach(tr => {
      if (isInDateRange(tr.createdAt)) {
        pushEntry({
          date: tr.createdAt,
          description: `Fund Transfer Sent to Account ID ${tr.to_account}`,
          method: '',
          details: '',
          note: tr.note || '',
          addedBy: tr.addedBy,
          debit: parseFloat(tr.amount),
          credit: 0
        });
      }
    });

    transfersIn.forEach(tr => {
      if (isInDateRange(tr.createdAt)) {
        pushEntry({
          date: tr.createdAt,
          description: `Fund Transfer Received from Account ID ${tr.from_account}`,
          method: '',
          details: '',
          note: tr.note || '',
          addedBy: tr.addedBy,
          debit: 0,
          credit: parseFloat(tr.amount)
        });
      }
    });

    sales.forEach(sale => {
      sale.payments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || sale.saleDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          pushEntry({
            date: paidDate,
            description: `Sale - Invoice: ${sale.invoiceNo || ''}`,
            method: pmt.method || '',
            details: pmt.note || '',
            note: sale.note || sale.additionalNotes || '',
            addedBy: sale.addedBy,
            debit: 0,
            credit: parseFloat(pmt.amount || 0)
          });
        }
      });
    });

    purchases.forEach(pur => {
      pur.payments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || pur.purchaseDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          pushEntry({
            date: paidDate,
            description: `Purchase - Ref: ${pur.referenceNo || ''}`,
            method: pmt.method || '',
            details: pmt.note || '',
            note: pur.note || pur.additionalNotes || '',
            addedBy: pur.addedBy,
            debit: parseFloat(pmt.amount || 0),
            credit: 0
          });
        }
      });
    });

    expenses.forEach(exp => {
      exp.payments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || exp.transactionDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          pushEntry({
            date: paidDate,
            description: `Expense - Ref: ${exp.referenceNo || ''}`,
            method: pmt.method || '',
            details: pmt.note || '',
            note: exp.note || exp.additionalNotes || '',
            addedBy: exp.addedBy,
            debit: parseFloat(pmt.amount || 0),
            credit: 0
          });
        }
      });
    });

    saleReturns.forEach(ret => {
      ret.returnPayments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || ret.returnDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          pushEntry({
            date: paidDate,
            description: `Sale Return - Ref: ${ret.referenceNo || ''}`,
            method: pmt.method || '',
            details: pmt.note || '',
            note: '',
            addedBy: ret.addedBy,
            debit: parseFloat(pmt.amount || 0),
            credit: 0
          });
        }
      });
    });

    purchaseReturns.forEach(ret => {
      ret.returnPayments?.forEach(pmt => {
        const paidDate = new Date(pmt.paidOn || ret.returnDate);
        if (pmt.account?.toString() === accountId && isInDateRange(paidDate)) {
          pushEntry({
            date: paidDate,
            description: `Purchase Return - Ref: ${ret.referenceNo || ''}`,
            method: pmt.method || '',
            details: pmt.note || '',
            note: '',
            addedBy: ret.addedBy,
            debit: 0,
            credit: parseFloat(pmt.amount || 0)
          });
        }
      });
    });

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({
      accountId,
      accountName: account.name,
      accountType: account.type,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      closingBalance: runningBalance.toFixed(2),
      entries
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

