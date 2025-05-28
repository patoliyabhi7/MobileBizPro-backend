const Deposit = require('../../models/depositModel');
const Account = require('../../models/accountModel');

exports.depositToAccount = async (req, res) => {
    try {
      const { to_account, amount, note } = req.body;
      const addedBy = req.user.userId;
      const deposit = await Deposit.create({ to_account, amount, note, addedBy });
      await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });
      const newDeposit = await Deposit.findById(deposit._id).populate('addedBy', 'name _id');
      res.status(201).json(newDeposit);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };