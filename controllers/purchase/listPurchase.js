const Purchase = require('../../models/purchaseModel');

exports.listPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find({ isDeleted: false })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('products.product', 'productName')
      .populate('addedBy', 'name _id')
      .populate('payments.account')
      .populate('payments.method');

    res.status(200).json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
