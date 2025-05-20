const Purchase = require('../../models/purchaseModel');

exports.deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    res.status(200).json({ message: 'Purchase deleted (soft delete)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};