const Purchase = require('../../models/purchaseModel');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const consumeStock = require('../../utils/consumeStock');
const Stock = require('../../models/stockModel');
const mongoose = require('mongoose');

exports.deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or already deleted' });
    }

    // First, validate that all products can be deleted
    const stockToConsume = [];
    const stockIds = purchase.products
      .filter(item => !item.isReturn && item.stockId)
      .map(item => item.stockId);
    
    if (stockIds.length > 0) {
      // Get current stock status
      const stocks = await Stock.find({ _id: { $in: stockIds } });
      
      // Check if all products have enough quantity to be deleted
      for (const item of purchase.products) {
        if (!item.isReturn && item.stockId) {
          const stock = stocks.find(s => s._id.toString() === item.stockId.toString());
          
          if (!stock) {
            return res.status(400).json({ 
              error: `Stock not found for product ${item.product}` 
            });
          }
          
          // For IMEI products, check if it's already sold
          if (stock.imeiNo && stock.status === 0) {
            return res.status(400).json({ 
              error: `Cannot delete purchase: Mobile with IMEI ${stock.imeiNo} has already been sold` 
            });
          }
          
          // For non-IMEI products, check if there's enough quantity
          if (!stock.imeiNo) {
            const requiredQty = item.quantity || 1;
            if (stock.quantity < requiredQty) {
              return res.status(400).json({ 
                error: `Cannot delete purchase: Not enough stock for product ${item.product}. Required: ${requiredQty}, Available: ${stock.quantity}` 
              });
            }
          }
          
          // If validation passed, add to the list for consumption
          stockToConsume.push({
            stockId: item.stockId,
            quantity: item.quantity || 1
          });
        }
      }
    }

    // If we got here, all validations passed - now perform the actual operations
    
    // Revert payments
    await revertAccountBalances(purchase.payments || [], 'purchase');

    // Consume stock
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
