const Sale = require('../../models/saleModel');

exports.deleteSale = async (req, res) => {
    try {
      const sale = await Sale.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
      if (!sale) {
        return res.status(404).json({ message: 'Sale not found' });
      }
      res.status(200).json({ message: 'Sale deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };