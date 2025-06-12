const Purchase = require('../../models/purchaseModel');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const consumeStock = require('../../utils/consumeStock');

exports.deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or already deleted' });
    }

    // Revert payments from account balances
    await revertAccountBalances(purchase.payments || [], 'purchase');

    // Remove stock only if not sold or returned
    const stockToConsume = purchase.products?.filter(p =>
      !p.isSold && !p.isReturn && p.stockId
    ).map(p => ({
      stockId: p.stockId,
      quantity: p.quantity || 1
    })) || [];

    if (stockToConsume.length > 0) {
      await consumeStock(stockToConsume);
    }

    purchase.isDeleted = true;
    await purchase.save();

    res.status(200).json({ message: 'Purchase soft deleted and stock/payment reverted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
