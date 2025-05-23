const Deposit = require('../../models/depositModel');

exports.depositToAccount = async (req, res) => {
    try {
      const { to_account, amount, note } = req.body;
      const addedBy = req.user.id;
      const deposit = await Deposit.create({ to_account, amount, note, addedBy });
      await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });
      res.status(201).json(deposit.populate('addedBy', 'name _id'));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };