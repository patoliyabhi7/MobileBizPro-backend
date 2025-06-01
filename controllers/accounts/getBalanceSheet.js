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

    const matchLocation = location_id ? { businessLocation: new mongoose.Types.ObjectId(location_id) } : {};

    // Helper to get end of the day
    const getEndOfDay = (dateStr) => {
      const d = new Date(dateStr);
      d.setHours(23, 59, 59, 999);
      return d;
    };
    const endOfDate = date ? getEndOfDay(date) : undefined;

    const saleQuery = { isDeleted: false, ...matchLocation };
    const purchaseQuery = { isDeleted: false, ...matchLocation };
    const expenseQuery = { isDeleted: false, ...matchLocation };

    if (endOfDate) saleQuery.saleDate = { $lte: endOfDate };
    if (endOfDate) purchaseQuery.purchaseDate = { $lte: endOfDate };
    if (endOfDate) expenseQuery.transactionDate = { $lte: endOfDate };

    const [sales, purchases, expenses, accounts] = await Promise.all([
      Sale.find(saleQuery).lean(),
      Purchase.find(purchaseQuery).lean(),
      Expense.find(expenseQuery).lean(),
      Account.find({ is_active: true, ...matchLocation }).lean(),
    ]);

    let customerDue = 0;
    for (const sale of sales) {
      customerDue += Number(sale.paymentDue || 0);
    }

    let supplierDue = 0;
    for (const purchase of purchases) {
      supplierDue += Number(purchase.paymentDue || 0);
    }

    const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.totalAmount || 0)), 0);

    let accountBalanceMap = {};

    // Sales payments (credit)
    for (const sale of sales) {
      if (!Array.isArray(sale.payments)) continue;
      for (const p of sale.payments) {
        if (!p.account) continue;
        const accId = p.account.toString();
        const paidOnDate = new Date(p.paidOn);
        if (endOfDate && paidOnDate > endOfDate) continue;
        if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
        accountBalanceMap[accId] += Number(p.amount || 0);
      }
    }

    // Purchase payments (debit)
    for (const purchase of purchases) {
      if (!Array.isArray(purchase.payments)) continue;
      for (const p of purchase.payments) {
        if (!p.account) continue;
        const accId = p.account.toString();
        const paidOnDate = new Date(p.paidOn);
        if (endOfDate && paidOnDate > endOfDate) continue;
        if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
        accountBalanceMap[accId] -= Number(p.amount || 0);
      }
    }

    // Expense payments (debit)
    for (const expense of expenses) {
      if (!Array.isArray(expense.payments)) continue;
      for (const p of expense.payments) {
        if (!p.account) continue;
        const accId = p.account.toString();
        const paidOnDate = new Date(p.paidOn);
        if (endOfDate && paidOnDate > endOfDate) continue;
        if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
        accountBalanceMap[accId] -= Number(p.amount || 0);
      }
    }

    let totalAccountBalance = 0;
    const accountBalances = accounts.map(acc => {
      const balance = accountBalanceMap[acc._id.toString()] || 0;
      totalAccountBalance += balance;
      return {
        accountId: acc._id,
        name: acc.name,
        balance: balance.toFixed(2),
      };
    });

    const stockMatch = { status: 1, ...matchLocation };
    const closingStockAgg = await Stock.aggregate([
      { $match: stockMatch },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
    ]);

    const closingStockValue = closingStockAgg.length ? closingStockAgg[0].totalAmount : 0;

    const totalAsset = totalAccountBalance + closingStockValue + customerDue;
    const totalLiability = supplierDue + totalExpense;

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

  } catch (err) {
    console.error("Balance sheet error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};



/*
exports.getBalanceSheet = async (req, res) => {
  try {
    let { location_id, date } = req.query;

    // Normalize filters
    if (!location_id || location_id === 'All locations') location_id = undefined;
    if (!date || date === 'All') date = undefined;
    const dateFilter = date ? { $lte: new Date(date) } : {};

    const matchLocation = location_id ? { businessLocation: new mongoose.Types.ObjectId(location_id) } : {};

    // Fetch relevant documents
    const [sales, purchases, expenses, accounts] = await Promise.all([
      Sale.find({ isDeleted: false, ...matchLocation, saleDate: dateFilter }).lean(),
      Purchase.find({ isDeleted: false, ...matchLocation, purchaseDate: dateFilter }).lean(),
      Expense.find({ isDeleted: false, ...matchLocation, transactionDate: dateFilter }).lean(),
      Account.find({ is_active: true }).lean(),
    ]);

    // Calculate Customer Dues
    let customerDue = 0;
    for (const sale of sales) {
      const totalAmount = Number(sale.final_total || 0);
      const paid = Array.isArray(sale.payments)
        ? sale.payments.reduce((sum, p) => {
            if (date && new Date(p.paidOn) > new Date(date)) return sum;
            return sum + (p.amount || 0);
          }, 0)
        : 0;
      customerDue += (totalAmount - paid);
    }

    // Calculate Supplier Dues
    let supplierDue = 0;
    for (const purchase of purchases) {
      const totalAmount = Number(purchase.final_total || 0);
      const paid = Array.isArray(purchase.payments)
        ? purchase.payments.reduce((sum, p) => {
            if (date && new Date(p.paidOn) > new Date(date)) return sum;
            return sum + (p.amount || 0);
          }, 0)
        : 0;
      supplierDue += (totalAmount - paid);
    }

    // Calculate Total Expenses
    const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.totalAmount || e.total || 0)), 0);

    // Account Balances (credit - debit based on payments across all models)
    let accountBalanceMap = {};
    const modelsWithPayments = [...sales, ...purchases, ...expenses];

    for (const item of modelsWithPayments) {
      if (!Array.isArray(item.payments)) continue;
      for (const p of item.payments) {
        if (!p.account) continue;
        const accId = p.account.toString();
        const paidOnDate = new Date(p.paidOn || item.date || item.saleDate || item.purchaseDate);
        if (date && paidOnDate > new Date(date)) continue;

        const isCredit = item.total || item.final_total === item.final_total; // crude way to separate sale (credit) vs others (debit)
        if (!accountBalanceMap[accId]) accountBalanceMap[accId] = 0;
        accountBalanceMap[accId] += isCredit ? Number(p.amount || 0) : -Number(p.amount || 0);
      }
    }

    let totalAccountBalance = 0;
    const accountBalances = accounts.map(acc => {
      const balance = accountBalanceMap[acc._id.toString()] || 0;
      totalAccountBalance += balance;
      return { name: acc.name, balance: balance.toFixed(2) };
    });

    // Closing Stock Calculation
    const stockMatch = { status: 1, ...matchLocation };
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
          _id: null,
          totalStockValue: { $sum: '$matchedProduct.unitCost' },
        },
      },
    ]);

    const closingStockValue = stocksGrouped[0]?.totalStockValue || 0;

    // Totals
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
*/