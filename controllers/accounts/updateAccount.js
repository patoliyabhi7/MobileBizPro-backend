const Account = require('../../models/accountModel');

exports.updateAccount = async (req, res) => {
    try {
      const account = await Account.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!account) return res.status(404).json({ error: 'Account not found' });
      res.status(200).json(account.populate('addedBy', 'name _id'));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };