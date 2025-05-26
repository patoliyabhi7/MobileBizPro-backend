const Account = require('../../models/accountModel');

exports.addAccount = async (req, res) => {
  try {
    req.body.addedBy = req.user.userId;
    const account = new Account(req.body);
    await account.save();
    res.status(201).json((await account.populate('addedBy', 'name _id')).populate('account_type'));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};