const Account = require('../../models/accountModel');

exports.toggleAccountStatus = async (req, res) => {
    try {
      const account = await Account.findById(req.params.id);
      if (!account) return res.status(404).json({ error: 'Account not found' });
      account.is_active = !account.is_active;
      await account.save();
      res.status(200).json({ message: `Account ${account.is_active ? 'activated' : 'deactivated'}` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };