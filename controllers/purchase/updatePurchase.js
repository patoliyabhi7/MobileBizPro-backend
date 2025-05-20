const Purchase = require('../../models/purchaseModel');

exports.updatePurchase = async (req, res) => {
  try {
    const updatedPurchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updatedPurchase || updatedPurchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or deleted' });
    }

    res.status(200).json({ message: 'Purchase updated successfully', updatedPurchase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};