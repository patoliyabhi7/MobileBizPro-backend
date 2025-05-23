const FundTransfer = require('../../models/fundTransferModel');
const Account = require('../../models/accountModel');

exports.fundTransfer = async (req, res) => {
    try {
      const { from_account, to_account, amount, note } = req.body;
      const addedBy = req.user.id;
      if (from_account === to_account) throw new Error('Accounts must be different');
      await Account.findByIdAndUpdate(from_account, { $inc: { balance: -amount } });
      await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });
      const transfer = await FundTransfer.create({ from_account, to_account, amount, note, addedBy });
      res.status(201).json(transfer.populate('addedBy', 'name _id'));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };