const Sale = require('../../models/saleModel');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const revertStock = require('../../utils/revertStock');

exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ message: 'Sale not found or already deleted' });
    }

    // Revert payments
    await revertAccountBalances(sale.payments || [], 'sale');

    // Revert stock
    const stockToRevert = sale.products?.filter(p => p.stockId).map(p => ({
      stockId: p.stockId,
      quantity: p.quantity || 1
    })) || [];

    if (stockToRevert.length > 0) {
      await revertStock(stockToRevert);
    }

    sale.isDeleted = true;
    await sale.save();

    res.status(200).json({ message: 'Sale soft deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
