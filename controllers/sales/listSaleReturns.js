const Sale = require('../../models/saleModel');

exports.listSaleReturns = async (req, res) => {
    try {
      const saleReturns = await Sale.find({ isDeleted: false, status: 'returned' })
        .populate('customer')
        .populate('businessLocation');
      res.status(200).json(saleReturns);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };