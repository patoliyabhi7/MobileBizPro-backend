const Deposit = require('../../models/depositModel');

exports.depositToAccount = async (req, res) => {
    try {
      const { to_account, amount, note, added_by } = req.body;
      const deposit = await Deposit.create({ to_account, amount, note, added_by });
      await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });
      res.status(201).json(deposit);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };