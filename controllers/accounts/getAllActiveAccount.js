const Account = require('../../models/accountModel');

exports.getAllActiveAccount = async (req, res) => {
    try {
      const accounts = await Account.find({ is_active: true });
      res.status(200).json(accounts.populate('addedBy', 'name _id').populate('account_type'));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };