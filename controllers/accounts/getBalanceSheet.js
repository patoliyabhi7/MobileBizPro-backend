const Account = require('../../models/accountModel');
const Expense = require('../../models/expenseModel');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');

exports.getBalanceSheet = async (req, res) => {
  try {
    let businessLocationId = req.query.businessLocationId;
    if (businessLocationId === 'All locations') businessLocationId = undefined;

    const date = new Date(req.query.date);

    // Account balances
    const accountList = await Account.find({ businessLocation: businessLocationId });

    const accountBalances = {};
    accountList.forEach(account => {
      accountBalances[account.name] = parseFloat(account.balance || 0).toFixed(2);
    });

    // Supplier due
    const supplierDueResult = await Expense.aggregate([
      {
        $match: {
          businessLocation: businessLocationId,
          date: { $lte: date }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total_amount" }
        }
      }
    ]);
    const supplierDue = supplierDueResult[0]?.total || 0;

    // Customer due
    const customerDueResult = await Sale.aggregate([
      {
        $match: {
          businessLocation: businessLocationId,
          date: { $lte: date }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$final_total" }
        }
      }
    ]);
    const customerDue = customerDueResult[0]?.total || 0;

    // Closing stock
    const closingStockResult = await Purchase.aggregate([
      {
        $match: {
          businessLocation: businessLocationId,
          date: { $lte: date }
        }
      },
      {
        $group: {
          _id: null,
          stockValue: {
            $sum: { $multiply: ["$quantity", "$purchase_price"] }
          }
        }
      }
    ]);
    const closingStock = closingStockResult[0]?.stockValue || 0;

    // Final balance sheet
    const balanceSheet = {
      liability: {
        supplier_due: supplierDue,
        capital_account_details: null // Placeholder for future
      },
      assets: {
        customer_due: customerDue,
        closing_stock: closingStock,
        account_balances: accountBalances
      }
    };

    res.status(200).json({
      location: businessLocationId || 'All locations',
      ...balanceSheet
    });
  } catch (error) {
    console.error('Balance sheet error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
