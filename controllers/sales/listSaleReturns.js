const Sale = require('../../models/saleModel');

exports.listSaleReturns = async (req, res) => {
    try {
      const saleReturns = await Sale.find({ isDeleted: false, status: 'return' })
        .populate('customer')
        .populate('businessLocation')
        .populate('addedBy', 'name _id')
        .populate('products.product')
      .populate('payments.account').populate('payments.method');
      res.status(200).json(saleReturns);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };