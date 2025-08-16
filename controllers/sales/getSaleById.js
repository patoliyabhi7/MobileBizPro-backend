const Sale = require('../../models/saleModel');

exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('products.stockId', 'quantity imeiNo serialNo status')
      .populate('payments.account')
      .populate('payments.method');

    if (!sale || sale.isDeleted) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    res.status(200).json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
