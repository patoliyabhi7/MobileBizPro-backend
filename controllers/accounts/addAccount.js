const Account = require('../../models/accountModel');

exports.addAccount = async (req, res) => {
  try {
    req.body.addedBy = req.user.userId;
    req.body.initialBalance = req.body.balance || 0;
    const account = new Account(req.body);
    await account.save();
    const newAccount = await Account.findById(account._id).populate('addedBy', 'name _id').populate('account_type').populate('businessLocation');
    res.status(201).json(newAccount);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};