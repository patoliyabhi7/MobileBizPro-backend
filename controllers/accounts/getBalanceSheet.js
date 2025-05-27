const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Account = require('../../models/accountModel');
const Expense = require('../../models/expenseModel');

exports.getBalanceSheet = async (req, res) => {
  try {
    const { location_id, date } = req.query;

    const filterByLocationAndDate = (query = {}) => ({
      ...query,
      ...(location_id && { businessLocation: location_id }),
      ...(date && { transaction_date: { $lte: new Date(date) } }),
    });

    const [sales, purchases, accounts, expenses] = await Promise.all([
      Sale.find(filterByLocationAndDate()),
      Purchase.find(filterByLocationAndDate()),
      Account.find(),
      Expense.find(filterByLocationAndDate())
    ]);

    let customerDue = 0;
    let supplierDue = 0;
    let totalAccountBalance = 0;
    let totalExpense = 0;

    // Customer Dues Calculation
    sales.forEach(sale => {
      sale.payments?.forEach(pay => {
        customerDue += parseFloat(pay.paymentDue || 0);
      });
    });

    // Supplier Dues Calculation
    purchases.forEach(purchase => {
      purchase.payments?.forEach(pay => {
        supplierDue += parseFloat(pay.paymentDue || 0);
      });
    });


    // Account Balances
    accounts.forEach(acc => {
      if (acc.status !== 'active') return;
      totalAccountBalance += parseFloat(acc.balance || 0);
    });

    // Expenses
    expenses.forEach(exp => {
      totalExpense += parseFloat(exp.totalAmount || 0);
    });

    res.status(200).json({
      customer_due: customerDue.toFixed(2),
      supplier_due: supplierDue.toFixed(2),
      account_balance: totalAccountBalance.toFixed(2),
      total_expense: totalExpense.toFixed(2),
      date: date || 'Till today',
      location_id: location_id || 'All locations',
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

