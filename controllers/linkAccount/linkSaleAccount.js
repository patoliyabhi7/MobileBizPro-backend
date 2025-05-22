const Sale = require('../../models/saleModel');

exports.linkSaleAccount = async (req, res) => {
    try {
      const sale = await Sale.findByIdAndUpdate(req.params.id, {
        linkedAccount: req.body.accountId
      }, { new: true });
      res.json(sale);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };