const FundTransfer = require('../../models/fundTransferModel');
const Account = require('../../models/accountModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.fundTransfer = async (req, res) => {
  try {
    const { from_account, to_account, amount, note, businessLocation, dateTime } = req.body;
    const addedBy = req.user.userId;

    if (!from_account || !to_account || !amount || !businessLocation) {
      throw new Error('Required fields: from_account, to_account, amount, businessLocation');
    }

    if (from_account === to_account) {
      throw new Error('From and To accounts must be different');
    }

    // Decrease from source account
    await Account.findByIdAndUpdate(from_account, { $inc: { balance: -amount } });

    // Increase in destination account
    await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });

    const transfer = await FundTransfer.create({
      from_account,
      to_account,
      amount,
      note,
      referenceNo: await generateAutoId('FT'),
      addedBy,
      businessLocation,
      dateTime: dateTime || new Date(),
    });

    const newTransfer = await FundTransfer.findById(transfer._id)
      .populate('addedBy', 'name _id')
      .populate('from_account', 'name _id')
      .populate('to_account', 'name _id');

    res.status(201).json(newTransfer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
