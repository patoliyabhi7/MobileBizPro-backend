const Sale = require('../../models/saleModel');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const revertStock = require('../../utils/revertStock');
const SaleReturn = require('../../models/saleReturnModel');
const Stock = require('../../models/stockModel');
const mongoose = require('mongoose');

exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ message: 'Sale not found or already deleted' });
    }

    // VALIDATION PHASE
    
    // Check 1: Verify no returns exist for this sale
    const hasReturns = await SaleReturn.exists({ 
      originalSale: sale._id,
      isDeleted: { $ne: true }
    });
    
    if (hasReturns) {
      return res.status(400).json({ 
        error: 'Cannot delete sale: This sale has associated returns. Please delete the returns first.' 
      });
    }
    
    // Check 2: Get all product stockIds to validate
    const stockIds = sale.products
      ?.filter(p => p.stockId)
      .map(p => p.stockId) || [];
    
    let stockToRevert = [];
    
    if (stockIds.length > 0) {
      // Get current stock status
      const stocks = await Stock.find({ _id: { $in: stockIds } });
      
      // Validate each product
      for (const product of sale.products || []) {
        if (product.stockId) {
          const stock = stocks.find(s => s._id.toString() === product.stockId.toString());
          
          if (!stock) {
            return res.status(400).json({ 
              error: `Stock not found for product in this sale` 
            });
          }
          
          // Add to stock reversion list if validation passes
          stockToRevert.push({
            stockId: product.stockId,
            quantity: product.quantity || 1
          });
        }
      }
    }
    
    // EXECUTION PHASE - Only runs if all validations passed
    
    // Revert payments
    await revertAccountBalances(sale.payments || [], 'sale');

    // Revert stock
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
