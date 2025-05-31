const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Account = require('../../models/accountModel');
const Expense = require('../../models/expenseModel');
const Stock = require('../../models/stockModel');

exports.getBalanceSheet = async (req, res) => {
  try {
    let { location_id, date } = req.query;

    // Normalize filters: if 'All locations' or undefined => no filter for location
    if (!location_id || location_id === 'All locations') {
      location_id = undefined;
    }

    // if 'All' or undefined => no date filter
    if (!date || date === 'All') {
      date = undefined;
    }

    // Build filter for location & date; apply only if defined
    const filterByLocationAndDate = (query = {}) => {
      const filter = { ...query, isDeleted: false };

      if (location_id) {
        filter.businessLocation = location_id;
      }

      if (date) {
        filter.createdAt = { $lte: new Date(date) };
      }

      return filter;
    };

    // Fetch sales, purchases, accounts, expenses with filters applied conditionally
    const [sales, purchases, accounts, expenses] = await Promise.all([
      Sale.find(filterByLocationAndDate()),
      Purchase.find(filterByLocationAndDate()),
      Account.find(),
      Expense.find(filterByLocationAndDate()),
    ]);

    let customerDue = 0;
    let supplierDue = 0;
    let totalAccountBalance = 0;
    let accountBalances = [];
    let totalExpense = 0;

    // Sum customer dues from sales
    sales.forEach(sale => {
      customerDue += parseFloat(sale.paymentDue || 0);
    });

    // Sum supplier dues from purchases
    purchases.forEach(purchase => {
      supplierDue += parseFloat(purchase.paymentDue || 0);
    });

    // Sum total expenses
    expenses.forEach(exp => {
      totalExpense += parseFloat(exp.totalAmount || 0);
    });

    // Sum account balances (only active accounts)
    accounts.forEach(acc => {
      if (!acc.is_active) return;

      const balance = parseFloat(acc.balance || 0);
      totalAccountBalance += balance;

      accountBalances.push({
        name: acc.name,
        balance: balance.toFixed(2),
      });
    });

    // Calculate Closing Stock

    // Match stocks with status=1 (in stock) and not deleted
    const stockMatch = { status: 1, isDeleted: false };
    if (location_id) {
      stockMatch.businessLocation = location_id;
    }

    // Aggregate stocks with purchase info joined
    const stockWithPurchase = await Stock.aggregate([
      { $match: stockMatch },
      {
        $lookup: {
          from: 'purchases', // Make sure collection name is correct in MongoDB
          localField: 'purchaseRef',
          foreignField: '_id',
          as: 'purchaseInfo'
        }
      },
      { $unwind: '$purchaseInfo' },
      // Apply purchase date filter here if date is defined
      ...(date ? [{ $match: { 'purchaseInfo.createdAt': { $lte: new Date(date) } } }] : []),
      {
        $group: {
          _id: '$purchaseRef',
          stockCountInStock: { $sum: 1 },
          purchaseTotalAmount: { $first: '$purchaseInfo.total' || '$purchaseInfo.totalAmount' } // Adjust field name for purchase total
        }
      }
    ]);

    // Get total stock counts per purchaseRef (all statuses, excluding deleted)
    const totalStockCountPerPurchase = await Stock.aggregate([
      { $match: location_id ? { businessLocation: location_id, isDeleted: false } : { isDeleted: false } },
      ...(date ? [{ $match: { createdAt: { $lte: new Date(date) } } }] : []),
      {
        $group: {
          _id: '$purchaseRef',
          totalStockCount: { $sum: 1 }
        }
      }
    ]);

    // Create a map for total stock count lookup by purchaseRef
    const totalStockCountMap = {};
    totalStockCountPerPurchase.forEach(item => {
      totalStockCountMap[item._id.toString()] = item.totalStockCount;
    });

    // Calculate closing stock value by distributing purchase total amount proportionally
    let closingStockValue = 0;
    stockWithPurchase.forEach(item => {
      const purchaseRefStr = item._id.toString();
      const totalCount = totalStockCountMap[purchaseRefStr] || 1; // Avoid division by zero
      const unitPrice = item.purchaseTotalAmount / totalCount;
      closingStockValue += unitPrice * item.stockCountInStock;
    });

    // Calculate total liability and asset
    const totalLiability = supplierDue;
    const totalAsset = totalAccountBalance + customerDue + closingStockValue;

    // Send final response
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

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
