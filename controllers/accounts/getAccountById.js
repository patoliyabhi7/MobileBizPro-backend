const Account = require('../../models/accountModel');

exports.getAccountById = async (req, res) => {
    try {
      const account = await Account.findById(req.params.id);
      if (!account) return res.status(404).json({ error: 'Account not found' });
      res.status(200).json(account);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };