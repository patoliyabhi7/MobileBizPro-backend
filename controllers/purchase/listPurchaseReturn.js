const Purchase = require('../../models/purchaseModel');

exports.listPurchaseReturns = async (req, res) => {
  try {
    const returns = await Purchase.find({ isDeleted: false, status: 'return' })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name');

    res.status(200).json(returns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};