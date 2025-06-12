const Purchase = require('../../models/purchaseModel');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const consumeStock = require('../../utils/consumeStock');

exports.deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or already deleted' });
    }

    // Revert payments
    await revertAccountBalances(purchase.payments || [], 'purchase');

    // Consume stock (only unsold and unreturned products)
    const stockToConsume = [];

    for (const item of purchase.products) {
      if (!item.isReturn && item.stockId) {
        stockToConsume.push({
          stockId: item.stockId,
          quantity: item.quantity || 1
        });
      }
    }

    if (stockToConsume.length > 0) {
      await consumeStock(stockToConsume);
    }

    purchase.isDeleted = true;
    await purchase.save();

    res.status(200).json({ message: 'Purchase soft deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
