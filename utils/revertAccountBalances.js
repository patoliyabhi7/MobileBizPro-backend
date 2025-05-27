const Account = require('../models/accountModel');   

exports.revertAccountBalances = async (payments = [], type) => {
    for (const payment of payments) {
      if (!payment.account) continue;
  
      const account = await Account.findById(payment.account);
      if (!account) continue;
  
      if (type === 'sale') {
        account.balance -= payment.amount;
      } else {
        account.balance += payment.amount;
      }
  
      await account.save();
    }
  };
  