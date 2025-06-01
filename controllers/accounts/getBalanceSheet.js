const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Account = require('../../models/accountModel');
const Expense = require('../../models/expenseModel');
const Stock = require('../../models/stockModel');

exports.getBalanceSheet = async (req, res) => {
  try {
    let { location_id, date } = req.query;

    // Normalize filters
    if (!location_id || location_id === 'All locations') location_id = undefined;
    if (!date || date === 'All') date = undefined;

    // Base filter for purchases, sales, expenses (exclude deleted)
    const baseFilter = { isDeleted: false };

    if (location_id) baseFilter.businessLocation = new mongoose.Types.ObjectId(location_id);
    if (date) baseFilter.createdAt = { $lte: new Date(date) };

    // For purchases, the date field is purchaseDate
    const purchaseFilter = { isDeleted: false };
    if (location_id) purchaseFilter.businessLocation = new mongoose.Types.ObjectId(location_id);
    if (date) purchaseFilter.purchaseDate = { $lte: new Date(date) };

    // For sales, saleDate
    const saleFilter = { isDeleted: false };
    if (location_id) saleFilter.businessLocation = new mongoose.Types.ObjectId(location_id);
    if (date) saleFilter.saleDate = { $lte: new Date(date) };

    // For expenses, transactionDate
    const expenseFilter = { isDeleted: false };
    if (location_id) expenseFilter.businessLocation = new mongoose.Types.ObjectId(location_id);
    if (date) expenseFilter.transactionDate = { $lte: new Date(date) };

    // Fetch data concurrently
    const [sales, purchases, accounts, expenses] = await Promise.all([
      Sale.find(saleFilter).lean(),
      Purchase.find(purchaseFilter).lean(),
      Account.find({ is_active: true }).lean(),
      Expense.find(expenseFilter).lean(),
    ]);

    // Sum customer dues from sales.paymentDue
    const customerDue = sales.reduce((sum, s) => sum + (Number(s.paymentDue) || 0), 0);

    // Sum supplier dues from purchases.paymentDue
    const supplierDue = purchases.reduce((sum, p) => sum + (Number(p.paymentDue) || 0), 0);

    // Sum expenses totalAmount or total
    const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.totalAmount || e.total || 0)), 0);

    // Sum account balances
    let totalAccountBalance = 0;
    const accountBalances = [];
    accounts.forEach(acc => {
      const bal = Number(acc.balance) || 0;
      totalAccountBalance += bal;
      accountBalances.push({ name: acc.name, balance: bal.toFixed(2) });
    });

    // Calculate closing stock value
    const stockMatch = { status: 1 };
    if (location_id) stockMatch.businessLocation = new mongoose.Types.ObjectId(location_id);

    const stocksGrouped = await Stock.aggregate([
      { $match: stockMatch },
      {
        $lookup: {
          from: 'purchases',
          localField: 'purchaseRef',
          foreignField: '_id',
          as: 'purchaseInfo',
        },
      },
      { $unwind: '$purchaseInfo' },
      {
        $addFields: {
          matchedProduct: {
            $filter: {
              input: '$purchaseInfo.products',
              as: 'prod',
              cond: { $eq: ['$$prod.product', '$product'] },
            },
          },
        },
      },
      { $unwind: '$matchedProduct' },
      {
        $group: {
          _id: '$purchaseRef',
          stockCount: { $sum: 1 },
          totalUnitCost: { $sum: '$matchedProduct.unitCost' },
        },
      },
    ]);

    let closingStockValue = 0;
    for (const item of stocksGrouped) {
      closingStockValue += item.totalUnitCost;
    }

    // Calculate totals
    const totalLiability = supplierDue;
    const totalAsset = totalAccountBalance + customerDue + closingStockValue;

    return res.status(200).json({
      customer_due: customerDue.toFixed(2),
      supplier_due: supplierDue.toFixed(2),
      account_balance: totalAccountBalance.toFixed(2),
      account_balances: accountBalances,
      total_expense: totalExpense.toFixed(2),
      closing_stock: closingStockValue.toFixed(2),
      date: date || 'Till today',
      location_id: location_id || 'All locations',
      total_liability: totalLiability.toFixed(2),
      total_asset: totalAsset.toFixed(2),
    });

  } catch (error) {
    console.error('Error in getBalanceSheet:', error);
    return res.status(500).json({ error: error.message });
  }
};
