const Sale = require('../../models/saleModel');       
const Purchase = require('../../models/purchaseModel'); 
const Expense = require('../../models/expenseModel');   

async function getPaymentsAccountReport(req, res) {
  try {
    // Fetch sales with populated customer and payments.account
    const sales = await Sale.find({ isDeleted: false })
      .populate({
        path: 'customer',
        select: 'firstName lastName name contactType',
      })
      .populate({
        path: 'payments.account',
        select: 'name',
      })
      .lean();

    // Fetch purchases with populated supplier and payments.account
    const purchases = await Purchase.find({ isDeleted: false })
      .populate({
        path: 'supplier',
        select: 'firstName lastName name contactType',
      })
      .populate({
        path: 'payments.account',
        select: 'name',
      })
      .lean();

    // Fetch expenses with populated expenseForContact and payments.account
    const expenses = await Expense.find({ isDeleted: false })
      .populate({
        path: 'expenseForContact',
        select: 'firstName lastName name contactType',
      })
      .populate({
        path: 'payments.account',
        select: 'name',
      })
      .lean();

    // Helper to build contact name
    const getContactName = (contact) => {
      if (!contact) return null;
      if (contact.firstName || contact.lastName) {
        return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      }
      // fallback to 'name' if exists (sometimes contact might have just 'name' field)
      return contact.name || null;
    };

    // Map sales to merged format
    const salesReport = sales.map(sale => ({
      refNo: sale.invoiceNo,
      contact: sale.customer ? {
        _id: sale.customer._id,
        name: getContactName(sale.customer),
        type: sale.customer.contactType,
      } : null,
      date: sale.saleDate,
      totalAmount: sale.total,
      payments: (sale.payments || []).map(p => ({
        paymentRefNo: p.paymentRefNo,
        paidDate: p.paidDate,
        amount: p.amount,
        account: p.account && p.account._id ? {
          _id: p.account._id,
          name: p.account.name
        } : null,
      })),
      sourceType: 'Sell',
    }));

    // Map purchases to merged format
    const purchaseReport = purchases.map(purchase => ({
      refNo: purchase.referenceNo,
      contact: purchase.supplier ? {
        _id: purchase.supplier._id,
        name: getContactName(purchase.supplier),
        type: purchase.supplier.contactType,
      } : null,
      date: purchase.purchaseDate,
      totalAmount: purchase.total,
      payments: (purchase.payments || []).map(p => ({
        paymentRefNo: p.paymentRefNo,
        paidDate: p.paidDate,
        amount: p.amount,
        account: p.account && p.account._id ? {
          _id: p.account._id,
          name: p.account.name
        } : null,
      })),
      sourceType: 'Purchase',
    }));

    // Map expenses to merged format
    const expenseReport = expenses.map(expense => ({
      refNo: expense.referenceNo,
      contact: expense.expenseForContact ? {
        _id: expense.expenseForContact._id,
        name: getContactName(expense.expenseForContact),
        type: expense.expenseForContact.contactType,
      } : null,
      date: expense.transactionDate,
      totalAmount: expense.totalAmount,
      payments: (expense.payments || []).map(p => ({
        paymentRefNo: p.paymentRefNo,
        paidDate: p.paidDate,
        amount: p.amount,
        account: p.account && p.account._id ? {
          _id: p.account._id,
          name: p.account.name
        } : null,
      })),
      sourceType: 'Expense',
    }));

    // Combine all into one report array
    const combinedReport = [...salesReport, ...purchaseReport, ...expenseReport];

    // Sort combined by descending date
    combinedReport.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(combinedReport);
  } catch (error) {
    console.error('Error generating payment account report:', error);
    res.status(500).json({ error: 'Failed to fetch payment account report' });
  }
}

module.exports = { getPaymentsAccountReport };
