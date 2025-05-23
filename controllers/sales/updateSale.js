const Sale = require('../../models/saleModel');

exports.updateSale = async (req, res) => {
    try {
      const sale = await Sale.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!sale) {
        return res.status(404).json({ message: 'Sale not found' });
      }
      res.status(200).json(sale.populate('addedBy', 'name _id'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };