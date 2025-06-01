const Account = require('../../models/accountModel');

exports.updateAccount = async (req, res) => {
  try {
    if(req.body.balance) delete req.body.balance;
    if(req.body.initialBalance) delete req.body.initialBalance;

    const account = await Account.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    .populate('addedBy', 'name _id')
    .populate('account_type')
    .populate('businessLocation');

    if (!account) return res.status(404).json({ error: 'Account not found' });

    res.status(200).json(account);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
