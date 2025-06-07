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
      .lean(); // Enable object modification

    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    const nonReturnedProducts = purchase.products?.filter(p => !p.isReturn) || [];

    if (nonReturnedProducts.length === 0) {
      return res.status(404).json({ message: 'Purchase fully returned' });
    }

    purchase.products = nonReturnedProducts;

    res.status(200).json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
