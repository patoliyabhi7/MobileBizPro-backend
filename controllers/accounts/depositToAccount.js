const Deposit = require('../../models/depositModel');
const Account = require('../../models/accountModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.depositToAccount = async (req, res) => {
  try {
    const { to_account, amount, note, businessLocation, dateTime } = req.body;
    const addedBy = req.user.userId;

    if (!to_account || !amount || !businessLocation) {
      throw new Error('Required fields: to_account, amount, businessLocation');
    }

    const deposit = await Deposit.create({
      to_account,
      amount,
      note,
      referenceNo: await generateAutoId('DEP'),
      addedBy,
      businessLocation,
      dateTime: dateTime || new Date(),
    });

    await Account.findByIdAndUpdate(to_account, { $inc: { balance: amount } });

    const newDeposit = await Deposit.findById(deposit._id)
      .populate('addedBy', 'name _id')
      .populate('to_account', 'name _id');

    res.status(201).json(newDeposit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
