const Account = require('../models/accountModel');

exports.updateAccountBalances = async (payments, type) => {
    if (!payments?.length) return;

    for (const payment of payments) {
        if (!payment.account) continue;

        const account = await Account.findById(payment.account);
        if (!account) continue;

        let change = 0;
        switch (type) {
            case 'sale':
            case 'purchase_return':
                change = payment.amount;
                break;
            case 'purchase':
            case 'expense':
            case 'sale_return':
                change = -payment.amount;
                break;
        }

        account.balance += change;
        await account.save();
    }
};
