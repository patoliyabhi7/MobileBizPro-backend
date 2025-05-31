const Account = require('../models/accountModel');

exports.revertAccountBalances = async (payments = [], type) => {
    if (!payments?.length) return;

    for (const payment of payments) {
        if (!payment.account) continue;

        const account = await Account.findById(payment.account);
        if (!account) continue;

        let revertAmount = 0;
        switch (type) {
            case 'sale':
            case 'purchase_return':
                revertAmount = -payment.amount;
                break;
            case 'purchase':
            case 'expense':
            case 'sale_return':
                revertAmount = payment.amount;
                break;
        }

        account.balance += revertAmount;
        await account.save();
    }
};
