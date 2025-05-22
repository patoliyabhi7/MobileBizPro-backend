const AccountType = require('../../models/accountTypeModel');

exports.addAccountType = async (req, res) => {
  try {
    const { name, parentType, note } = req.body;
    const newAccountType = new AccountType({ name, parentType, note });
    await newAccountType.save();
    res.status(201).json({ message: 'Account type created successfully', data: newAccountType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};