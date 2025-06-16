const Stock = require('../../models/stockModel');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');

exports.getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const locationFilter = locationId && locationId !== 'All locations' ? { businessLocation: locationId } : {};
    
    // Define date ranges
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Set to end of day

    // Helper function to add location and date filters to queries
    const addFilters = (query, dateField) => ({
      ...query,
      ...locationFilter,
      [dateField]: { $gte: start, $lte: end },
      isDeleted: { $ne: true }
    });

    // Get opening stock (stock before start date)
    const getOpeningStockValue = async () => {
      // Get all stock items available before start date
      const stockBeforeStart = await Stock.find({
        ...locationFilter,
        createdAt: { $lt: start }
      }).populate('product');

      let purchaseValue = 0;
      let saleValue = 0;

      // Calculate values based on unit cost and selling price
      for (const item of stockBeforeStart) {
        const qty = item.quantity || 0;
        purchaseValue += qty * (item.unitCost || 0);
        saleValue += qty * (item.product?.sellingPrice || 0);
      }

      return { purchaseValue, saleValue };
    };

    // Get closing stock (current stock at end date)
    const getClosingStockValue = async () => {
      // Get all stock items available at or before end date
      const stockAtEnd = await Stock.find({
        ...locationFilter,
        createdAt: { $lte: end }
      }).populate('product');

      let purchaseValue = 0;
      let saleValue = 0;

      // Calculate values based on unit cost and selling price
      for (const item of stockAtEnd) {
        const qty = item.quantity || 0;
        purchaseValue += qty * (item.unitCost || 0);
        saleValue += qty * (item.product?.sellingPrice || 0);
      }

      return { purchaseValue, saleValue };
    };

    // Get total purchases
    const getTotalPurchases = async () => {
      const purchases = await Purchase.find(addFilters({}, 'purchaseDate'));
      return purchases.reduce((total, purchase) => {
        // Sum up total purchase amount
        const purchaseTotal = purchase.products.reduce((sum, product) => {
          return sum + (product.quantity * product.unitCost || 0);
        }, 0);
        return total + purchaseTotal;
      }, 0);
    };

    // Get total sales
    const getTotalSales = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate'));
      return sales.reduce((total, sale) => {
        // Sum up total sale amount
        const saleTotal = sale.products.reduce((sum, product) => {
          return sum + (product.quantity * product.unitPrice || 0);
        }, 0);
        return total + saleTotal;
      }, 0);
    };

    // Get total expenses
    const getTotalExpenses = async () => {
      const expenses = await Expense.find(addFilters({}, 'transactionDate'));
      return expenses.reduce((total, expense) => {
        return total + (expense.amount || 0);
      }, 0);
    };

    // Get purchase shipping charges
    const getPurchaseShippingCharges = async () => {
      const purchases = await Purchase.find(addFilters({}, 'purchaseDate'));
      return purchases.reduce((total, purchase) => {
        return total + (purchase.shippingCharges || 0);
      }, 0);
    };

    // Get sell shipping charges
    const getSellShippingCharges = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate'));
      return sales.reduce((total, sale) => {
        return total + (sale.shippingCharges || 0);
      }, 0);
    };

    // Get purchase additional expenses
    const getPurchaseAdditionalExpenses = async () => {
      const purchases = await Purchase.find(addFilters({}, 'purchaseDate'));
      return purchases.reduce((total, purchase) => {
        return total + (purchase.additionalExpenses || 0);
      }, 0);
    };

    // Get sell additional expenses
    const getSellAdditionalExpenses = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate'));
      return sales.reduce((total, sale) => {
        return total + (sale.additionalExpenses || 0);
      }, 0);
    };

    // Get stock adjustments
    const getStockAdjustments = async () => {
      // Implement based on your stock adjustment model
      return 0;
    };

    // Get transfer shipping charges
    const getTransferShippingCharges = async () => {
      // Implement based on your stock transfer model
      return 0;
    };

    // Get customer rewards/discounts
    const getCustomerRewards = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate'));
      return sales.reduce((total, sale) => {
        return total + (sale.discountAmount || 0);
      }, 0);
    };

    // Get sale returns
    const getSaleReturns = async () => {
      const returns = await SaleReturn.find(addFilters({}, 'returnDate'));
      return returns.reduce((total, ret) => {
        return total + (ret.totalAmount || 0);
      }, 0);
    };

    // Get purchase returns
    const getPurchaseReturns = async () => {
      const returns = await PurchaseReturn.find(addFilters({}, 'returnDate'));
      return returns.reduce((total, ret) => {
        return total + (ret.totalAmount || 0);
      }, 0);
    };

    // Get sell discounts
    const getSellDiscounts = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate'));
      return sales.reduce((total, sale) => {
        return total + (sale.discountAmount || 0);
      }, 0);
    };

    // Get purchase discounts
    const getPurchaseDiscounts = async () => {
      const purchases = await Purchase.find(addFilters({}, 'purchaseDate'));
      return purchases.reduce((total, purchase) => {
        return total + (purchase.discountAmount || 0);
      }, 0);
    };

    // Get sell round off
    const getSellRoundOff = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate'));
      return sales.reduce((total, sale) => {
        return total + (sale.roundOffAmount || 0);
      }, 0);
    };

    // Get stock recovered
    const getStockRecovered = async () => {
      // Implement based on your business logic
      return 0;
    };

    // Get all the data concurrently
    const [
      openingStock,
      closingStock,
      totalPurchase,
      totalSales,
      totalExpense,
      purchaseShippingCharge,
      sellShippingCharge,
      purchaseAdditionalExpenses,
      sellAdditionalExpenses,
      stockAdjustment,
      transferShippingCharge,
      customerReward,
      saleReturn,
      purchaseReturn,
      sellDiscount,
      purchaseDiscount,
      sellRoundOff,
      stockRecovered
    ] = await Promise.all([
      getOpeningStockValue(),
      getClosingStockValue(),
      getTotalPurchases(),
      getTotalSales(),
      getTotalExpenses(),
      getPurchaseShippingCharges(),
      getSellShippingCharges(),
      getPurchaseAdditionalExpenses(),
      getSellAdditionalExpenses(),
      getStockAdjustments(),
      getTransferShippingCharges(),
      getCustomerRewards(),
      getSaleReturns(),
      getPurchaseReturns(),
      getSellDiscounts(),
      getPurchaseDiscounts(),
      getSellRoundOff(),
      getStockRecovered()
    ]);

    // Calculate Gross Profit
    const grossProfit = totalSales - totalPurchase;

    // Calculate Net Profit based on the formula in the image
    const netProfit = grossProfit + 
                      (sellShippingCharge + sellAdditionalExpenses + stockRecovered + purchaseDiscount + sellRoundOff) -
                      (stockAdjustment + totalExpense + purchaseShippingCharge + transferShippingCharge + purchaseAdditionalExpenses + sellDiscount + customerReward);

    // Format response
    const report = {
      startDate,
      endDate,
      locationId: locationId || 'All locations',
      // Left column (costs)
      openingStock: {
        byPurchasePrice: openingStock.purchaseValue.toFixed(2),
        bySalePrice: openingStock.saleValue.toFixed(2)
      },
      totalPurchase: totalPurchase.toFixed(2),
      totalStockAdjustment: stockAdjustment.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      totalPurchaseShippingCharge: purchaseShippingCharge.toFixed(2),
      purchaseAdditionalExpenses: purchaseAdditionalExpenses.toFixed(2),
      totalTransferShippingCharge: transferShippingCharge.toFixed(2),
      totalSellDiscount: sellDiscount.toFixed(2),
      totalCustomerReward: customerReward.toFixed(2),
      totalSaleReturn: saleReturn.toFixed(2),
      
      // Right column (income)
      closingStock: {
        byPurchasePrice: closingStock.purchaseValue.toFixed(2),
        bySalePrice: closingStock.saleValue.toFixed(2)
      },
      totalSales: totalSales.toFixed(2),
      totalSellShippingCharge: sellShippingCharge.toFixed(2),
      sellAdditionalExpenses: sellAdditionalExpenses.toFixed(2),
      totalStockRecovered: stockRecovered.toFixed(2),
      totalPurchaseReturn: purchaseReturn.toFixed(2),
      totalPurchaseDiscount: purchaseDiscount.toFixed(2),
      totalSellRoundOff: sellRoundOff.toFixed(2),
      
      // Profit calculations
      grossProfit: grossProfit.toFixed(2),
      netProfit: netProfit.toFixed(2)
    };

    res.status(200).json(report);
  } catch (err) {
    console.error('Error generating profit/loss report:', err);
    res.status(500).json({ error: err.message || 'Error generating profit/loss report' });
  }
};
