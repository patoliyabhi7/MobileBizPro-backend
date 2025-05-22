const AccountType = require('../../models/accountTypeModel');

exports.updateAccountType = async (req, res) => {
    try {
      const { name, parentType, note } = req.body;
      const updated = await AccountType.findByIdAndUpdate(
        req.params.id,
        { name, parentType, note },
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Account type not found' });
      res.status(200).json({ message: 'Updated successfully', data: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };