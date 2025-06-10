const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');

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

    const [deposits, transfersOut, transfersIn, sales, purchases, expenses, saleReturns, purchaseReturns] = await Promise.all([
      Deposit.find(location_id ? { businessLocation: location_id } : {}).populate('to_account'),
      FundTransfer.find(location_id ? { businessLocation: location_id } : {}).populate('from_account to_account'),
      FundTransfer.find(location_id ? { businessLocation: location_id } : {}).populate('from_account to_account'),
      Sale.find(location_id ? { businessLocation: location_id } : {}).populate('addedBy customer payments.account payments.method'),
      Purchase.find(location_id ? { businessLocation: location_id} : {}).populate('addedBy supplier payments.account payments.method'),
      Expense.find(location_id ? { businessLocation: location_id } : {}).populate('payments.account payments.method category'),
      SaleReturn.find(location_id ? { businessLocation: location_id } : {}).populate('addedBy returnPayments.account returnPayments.method originalSale'),
      PurchaseReturn.find(location_id ? { businessLocation: location_id } : {}).populate('addedBy returnPayments.account returnPayments.method originalPurchase'),
    ]);

    let runningBalance = 0;
    let totalCredit = 0;
    let totalDebit = 0;
    const entries = [];

    const pushEntry = ({ date, description, method, details, debit, credit, account }) => {
      if (!isInRange(date)) return;

      const transaction_type = credit ? 'credit' : 'debit';
      if (account_type && transaction_type !== account_type) return;

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
        account,
        description,
        paymentMethod: method || '',
        paymentDetails: details || '',
        debit: debit ? debit.toFixed(2) : '',
        credit: credit ? credit.toFixed(2) : '',
        balance: runningBalance.toFixed(2),
        transaction_type,
      });
    };

    // Deposit
    deposits.forEach(dep => {
      const accountName = dep.to_account?.name || dep.to_account?.accountNumber || 'N/A';
      pushEntry({
        date: dep.createdAt,
        description: `Deposit - Ref: ${dep.ref_no || '-'}`,
        method: dep.payment_method || '',
        details: dep.payment_details || '',
        credit: parseFloat(dep.amount),
        debit: 0,
        account: accountName
      });
    });

    // Fund Transfers
    transfersIn.forEach(tr => {
      const fromAcc = tr.from_account?.name || tr.from_account?.accountNumber || 'N/A';
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Received from A/C ${fromAcc}`,
        method: tr.payment_method || '',
        details: tr.payment_details || '',
        credit: parseFloat(tr.amount),
        debit: 0,
        account: fromAcc
      });
    });

    transfersOut.forEach(tr => {
      const toAcc = tr.to_account?.name || tr.to_account?.accountNumber || 'N/A';
      pushEntry({
        date: tr.createdAt,
        description: `Fund Transfer Sent to A/C ${toAcc}`,
        method: tr.payment_method || '',
        details: tr.payment_details || '',
        credit: 0,
        debit: parseFloat(tr.amount),
        account: toAcc
      });
    });

    // Sales
    for (const sale of sales) {
      for (const pay of sale.payments || []) {
        if (!account_id || (pay.account && pay.account._id.toString() === account_id)) {
          const addedByName = sale.addedBy?.name || '';
          const customerName = sale.customer?.firstName ? `${sale.customer.firstName} ${sale.customer.lastName || ''}` : '';
          const accountName = pay.account?.name || pay.account?.accountNumber || 'N/A';
          const description = `Sell\nCustomer: ${customerName}\nInvoice No.: ${sale.invoiceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${addedByName}`;

          pushEntry({
            date: pay.paidOn || sale.saleDate,
            description,
            method: pay.method?.name || '',
            details: pay.note || '',
            credit: parseFloat(pay.amount || 0),
            debit: 0,
            account: accountName
          });
        }
      }
    }

    // Purchases
    for (const pur of purchases) {
      for (const pay of pur.payments || []) {
        if (!account_id || (pay.account && pay.account._id.toString() === account_id)) {
          const addedByName = pur.addedBy?.name || '';
          const supplierName = pur.supplier?.businessName || '';
          const accountName = pay.account?.name || pay.account?.accountNumber || 'N/A';
          const description = `Purchase\nSupplier: ${supplierName}\nRef: ${pur.referenceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${addedByName}`;

          pushEntry({
            date: pay.paidOn || pur.purchaseDate,
            description,
            method: pay.method?.name || '',
            details: pay.note || '',
            debit: parseFloat(pay.amount || 0),
            credit: 0,
            account: accountName
          });
        }
      }
    }

    // Expenses
    expenses.forEach(exp => {
      exp.payments?.forEach(pay => {
        if (!account_id || (pay.account && pay.account._id.toString() === account_id)) {
          const accountName = pay.account?.name || pay.account?.accountNumber || 'N/A';
          pushEntry({
            date: pay.paidOn || exp.transactionDate,
            description: `Expense - ${exp.category?.name || 'General'}`,
            method: pay.method?.name || '',
            details: pay.payment_details || '',
            credit: 0,
            debit: parseFloat(pay.amount || 0),
            account: accountName
          });
        }
      });
    });

    // Sale Returns (Debit - Money Returned to Customer)
    saleReturns.forEach(ret => {
      ret.returnPayments?.forEach(pay => {
        if (!account_id || (pay.account && pay.account._id.toString() === account_id)) {
          const accountName = pay.account?.name || pay.account?.accountNumber || 'N/A';
          const description = `Sale Return\nRef: ${ret.referenceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${ret.addedBy?.name || ''}`;

          pushEntry({
            date: pay.paidOn || ret.returnDate,
            description,
            method: pay.method?.name || '',
            details: pay.note || '',
            credit: 0,
            debit: parseFloat(pay.amount || 0),
            account: accountName
          });
        }
      });
    });

    // Purchase Returns (Credit - Money Received from Supplier)
    purchaseReturns.forEach(ret => {
      ret.returnPayments?.forEach(pay => {
        if (!account_id || (pay.account && pay.account._id.toString() === account_id)) {
          const accountName = pay.account?.name || pay.account?.accountNumber || 'N/A';
          const description = `Purchase Return\nRef: ${ret.referenceNo}\nPay reference no.: ${pay.paymentRefNo}\nAdded By: ${ret.addedBy?.name || ''}`;

          pushEntry({
            date: pay.paidOn || ret.returnDate,
            description,
            method: pay.method?.name || '',
            details: pay.note || '',
            credit: parseFloat(pay.amount || 0),
            debit: 0,
            account: accountName
          });
        }
      });
    });

    // Sort & Calculate Opening Balance
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    const opening_balance = entries.length > 0
      ? parseFloat(entries[0].balance) - (parseFloat(entries[0].credit || 0) - parseFloat(entries[0].debit || 0))
      : 0;

    // Final sort DESC
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

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
