const FundTransfer = require('../../models/fundTransferModel');
const Account = require('../../models/accountModel');

exports.fundTransfer = async (req, res) => {
    try {
      const { from_account, to_account, amount, note } = req.body;
      const addedBy = req.user.userId;
      if (from_account === to_account) throw new Error('Accounts must be different');
      await Account.findByIdAndUpdate(from_account, { $inc: { balance: -amount } });
      await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });
      const transfer = await FundTransfer.create({ from_account, to_account, amount, note, addedBy });
      const newTransfer = await FundTransfer.findById(transfer._id).populate('addedBy', 'name _id');
      res.status(201).json(newTransfer);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };