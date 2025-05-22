const Purchase = require('../../models/purchaseModel');

exports.linkPurchaseAccount = async (req, res) => {
    try {
      const purchase = await Purchase.findByIdAndUpdate(req.params.id, {
        linkedAccount: req.body.accountId
      }, { new: true });
      res.json(purchase);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };