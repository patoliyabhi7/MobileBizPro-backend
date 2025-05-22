const FundTransfer = require('../../models/fundTransferModel');
const Account = require('../../models/accountModel');

exports.fundTransfer = async (req, res) => {
    try {
      const { from_account, to_account, amount, note, added_by } = req.body;
      if (from_account === to_account) throw new Error('Accounts must be different');
      await Account.findByIdAndUpdate(from_account, { $inc: { balance: -amount } });
      await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });
      const transfer = await FundTransfer.create({ from_account, to_account, amount, note, added_by });
      res.status(201).json(transfer);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };