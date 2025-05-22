const AccountType = require('../../models/accountTypeModel');

exports.deleteAccountType = async (req, res) => {
    try {
      const deleted = await AccountType.findByIdAndUpdate(
        req.params.id,
        { isDeleted: true },
        { new: true }
      );
      if (!deleted) return res.status(404).json({ message: 'Account type not found' });
      res.status(200).json({ message: 'Account type deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };