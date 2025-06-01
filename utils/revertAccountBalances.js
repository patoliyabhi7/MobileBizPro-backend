const Account = require('../models/accountModel');

exports.revertAccountBalances = async (payments = [], type) => {
  if (!payments?.length) return;

  for (const payment of payments) {
    if (!payment.account) continue;

    const account = await Account.findById(payment.account);
    if (!account) continue;

    const amount = Number(payment.amount || 0);
    if (isNaN(amount)) continue;

    let revertAmount = 0;
    switch (type) {
      case 'sale':
      case 'purchase_return':
        revertAmount = -amount;
        break;
      case 'purchase':
      case 'expense':
      case 'sale_return':
        revertAmount = amount;
        break;
    }

    account.balance += revertAmount;
    await account.save();
  }
};
