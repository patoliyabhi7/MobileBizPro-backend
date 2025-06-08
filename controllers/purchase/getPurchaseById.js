const Purchase = require('../../models/purchaseModel');

exports.getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('products.product', 'productName')
      .populate('addedBy', 'name _id')
      .populate('payments.account')
      .populate('payments.method')
      .lean();

    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    res.status(200).json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
