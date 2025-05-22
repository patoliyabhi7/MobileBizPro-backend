const AccountType = require('../../models/accountTypeModel');

exports.getAccountTypeById = async (req, res) => {
    try {
      const accountType = await AccountType.findById(req.params.id);
      if (!accountType || accountType.isDeleted) {
        return res.status(404).json({ message: 'Account type not found' });
      }
      res.status(200).json({ data: accountType });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };