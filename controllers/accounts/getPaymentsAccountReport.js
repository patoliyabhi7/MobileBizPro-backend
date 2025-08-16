const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
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

async function getPaymentsAccountReport(req, res) {
  try {
    const { businessLocation, startDate, endDate } = req.query;

    const saleFilter = { ...getDateRangeMatch('saleDate', startDate, endDate, businessLocation), isDeleted: { $ne: true } };
    const purchaseFilter = { ...getDateRangeMatch('purchaseDate', startDate, endDate, businessLocation), isDeleted: { $ne: true } };
    const expenseFilter = { ...getDateRangeMatch('transactionDate', startDate, endDate, businessLocation), isDeleted: { $ne: true } };
    const purchaseReturnFilter = { ...getDateRangeMatch('returnDate', startDate, endDate, businessLocation), isDeleted: { $ne: true } };

    const [sales, purchases, expenses, purchaseReturns] = await Promise.all([
      Sale.find(saleFilter)
        .populate({ path: 'customer', select: 'firstName lastName name contactType' })
        .populate({ path: 'payments.account', select: 'name' })
        .lean(),

      Purchase.find(purchaseFilter)
        .populate({ path: 'supplier', select: 'firstName lastName name contactType' })
        .populate({ path: 'payments.account', select: 'name' })
        .lean(),

      Expense.find(expenseFilter)
        .populate({ path: 'expenseForContact', select: 'firstName lastName name contactType' })
        .populate({ path: 'payments.account', select: 'name' })
        .lean(),

      PurchaseReturn.find(purchaseReturnFilter)
        .populate({ path: 'supplier', select: 'firstName lastName name contactType' })
        .populate({ path: 'payments.account', select: 'name' })
        .lean(),
    ]);

    const getContactName = (contact) => {
      if (!contact) return null;
      if (contact.firstName || contact.lastName) {
        return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      }
      return contact.name || null;
    };

    const getPaymentDetails = (entry, type, refNo, contact, entryDate) => {
      if (!entry?.payments?.length) return [];

      const accountNames = [
        ...new Set(entry.payments.map(p => p.account?.name).filter(Boolean))
      ].join(' & ');

      const totalAmount = entry.payments.reduce((sum, p) => sum + (p.amount || 0), 0);

      const date = entry.payments[0].paidDate || entryDate;

      return [{
        date,
        paymentRefNo: entry.payments.map(p => p.paymentRefNo).filter(Boolean).join(' / ') || '-',
        invoiceOrRefNo: refNo || '-',
        amount: totalAmount,
        paymentType: type,
        account: accountNames || '-',
        description: contact
          ? `${contact.contactType === 'customer' ? 'Customer' : 'Supplier'}: ${getContactName(contact)}`
          : '-',
      }];
    };

    const salesReport = sales.flatMap(sale =>
      getPaymentDetails(sale, 'Sell', sale.invoiceNo, sale.customer, sale.saleDate)
    );

    const purchaseReport = purchases.flatMap(purchase =>
      getPaymentDetails(purchase, 'Purchase', purchase.referenceNo, purchase.supplier, purchase.purchaseDate)
    );

    const expenseReport = expenses.flatMap(expense =>
      getPaymentDetails(expense, 'Expense', expense.referenceNo, expense.expenseForContact, expense.transactionDate)
    );

    const purchaseReturnReport = purchaseReturns.flatMap(ret =>
      getPaymentDetails(ret, 'Purchase Return', ret.referenceNo, ret.supplier, ret.returnDate)
    );

    const combinedReport = [
      ...salesReport,
      ...purchaseReport,
      ...expenseReport,
      ...purchaseReturnReport
    ];

    combinedReport.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(combinedReport);
  } catch (error) {
    console.error('Error generating payment account report:', error);
    res.status(500).json({ error: 'Failed to fetch payment account report' });
  }
}

module.exports = { getPaymentsAccountReport };
