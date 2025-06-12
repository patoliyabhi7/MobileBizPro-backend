const Sale = require('../../models/saleModel');
const revertStock = require('../../utils/revertStock');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ message: 'Sale not found or already deleted' });
    }

    // Revert account balances
    await revertAccountBalances(sale.payments || [], 'sale');

    // Revert stock for all sold products with their actual quantity
    const productsToRevert = sale.products?.filter(p => p.stockId).map(p => ({
      stockId: p.stockId,
      quantity: p.quantity || 1 // fallback if somehow not present
    })) || [];

    if (productsToRevert.length > 0) {
      await revertStock(productsToRevert);
    }

    sale.isDeleted = true;
    await sale.save();

    res.status(200).json({ message: 'Sale soft deleted and stock/balance reverted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
