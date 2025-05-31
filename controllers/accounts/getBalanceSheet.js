const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Account = require('../../models/accountModel');
const Expense = require('../../models/expenseModel');
const Stock = require('../../models/stockModel');

exports.getBalanceSheet = async (req, res) => {
  try {
    let { location_id, date } = req.query;

    if (!location_id || location_id === 'All locations') location_id = undefined;
    if (!date || date === 'All') date = undefined;

    const baseFilter = { isDeleted: false };
    if (location_id) baseFilter.businessLocation = new mongoose.Types.ObjectId(location_id);
    if (date) baseFilter.createdAt = { $lte: new Date(date) };

    // Fetch sales, purchases, accounts, expenses concurrently
    const [sales, purchases, accounts, expenses] = await Promise.all([
      Sale.find(baseFilter),
      Purchase.find(baseFilter),
      Account.find({ is_active: true }),
      Expense.find(baseFilter),
    ]);

    // Calculate dues and expenses
    const customerDue = sales.reduce((sum, s) => sum + (s.paymentDue || 0), 0);
    const supplierDue = purchases.reduce((sum, p) => sum + (p.paymentDue || 0), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + (e.total || e.totalAmount || 0), 0);

    // Calculate total account balances
    let totalAccountBalance = 0;
    const accountBalances = [];
    accounts.forEach(acc => {
      const bal = acc.balance || 0;
      totalAccountBalance += bal;
      accountBalances.push({ name: acc.name, balance: bal.toFixed(2) });
    });

    // Calculate closing stock value using Stock -> Purchase.products.unitCost mapping
    const stockMatch = { status: 1 };
    if (location_id) stockMatch.businessLocation = new mongoose.Types.ObjectId(location_id);

    const stocksGrouped = await Stock.aggregate([
      { $match: stockMatch },
      {
        $lookup: {
          from: 'purchases',
          localField: 'purchaseRef',
          foreignField: '_id',
          as: 'purchaseInfo'
        }
      },
      { $unwind: '$purchaseInfo' },
      {
        $addFields: {
          matchedProduct: {
            $filter: {
              input: '$purchaseInfo.products',
              as: 'prod',
              cond: { $eq: ['$$prod.product', '$product'] }
            }
          }
        }
      },
      { $unwind: '$matchedProduct' },
      {
        $group: {
          _id: '$purchaseRef',
          stockCount: { $sum: 1 },
          totalUnitCost: { $sum: '$matchedProduct.unitCost' }
        }
      }
    ]);

    let closingStockValue = 0;
    for (const item of stocksGrouped) {
      closingStockValue += item.totalUnitCost;
    }

    // Calculate totals
    const totalLiability = supplierDue;
    const totalAsset = totalAccountBalance + customerDue + closingStockValue;

    res.status(200).json({
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
    res.status(500).json({ error: error.message });
  }
};
