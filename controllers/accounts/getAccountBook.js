const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const Deposit = require('../../models/depositModel');
const FundTransfer = require('../../models/fundTransferModel');

exports.getAccountBook = async (req, res) => {
  try {
    const accountId = req.params.id;

    const deposits = await Deposit.find({ to_account: accountId });
    const transfersOut = await FundTransfer.find({ from_account: accountId });
    const transfersIn = await FundTransfer.find({ to_account: accountId });

    const linkedSales = await Sale.find({ linkedAccount: accountId });
    const linkedPurchases = await Purchase.find({ linkedAccount: accountId });
    const linkedExpenses = await Expense.find({ linkedAccount: accountId });

    res.status(200).json({
      deposits,
      transfersIn,
      transfersOut,
      linkedSales,
      linkedPurchases,
      linkedExpenses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
