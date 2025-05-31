const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Account = require('../../models/accountModel');
const Expense = require('../../models/expenseModel');

exports.getBalanceSheet = async (req, res) => {
  try {
    const { location_id, date } = req.query;

    const filterByLocationAndDate = (query = {}) => ({
      ...query,
      ...({ businessLocation: location_id }),
      ...({ createdAt: { $lte: new Date(date) } }), // Changed to createdAt for all since paymentDue isn't date-based
      isDeleted: false,
    });

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

    // 💰 Customer Dues (from sales)
    sales.forEach(sale => {
      customerDue += parseFloat(sale.paymentDue || 0);
    });

    // 💸 Supplier Dues (from purchases)
    purchases.forEach(purchase => {
      supplierDue += parseFloat(purchase.paymentDue || 0);
    });

    // 🧾 Total Expense
    expenses.forEach(exp => {
      totalExpense += parseFloat(exp.totalAmount || 0);
    });

    // 🏦 Account Balances
    accounts.forEach(acc => {
      if (!acc.is_active) return;

      const balance = parseFloat(acc.balance || 0);
      totalAccountBalance += balance;

      accountBalances.push({
        name: acc.name,
        balance: balance.toFixed(2),
      });
    });

    //calculate total liability and total asset
    const totalLiability = supplierDue;
    const totalAsset = totalAccountBalance + totalExpense + customerDue;

    // 📊 Final Response
    res.status(200).json({
      customer_due: customerDue.toFixed(2),
      supplier_due: supplierDue.toFixed(2),
      account_balance: totalAccountBalance.toFixed(2),
      account_balances: accountBalances,
      total_expense: totalExpense.toFixed(2),
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
