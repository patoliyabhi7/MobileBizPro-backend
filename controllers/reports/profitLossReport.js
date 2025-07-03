const Stock = require('../../models/stockModel');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const Expense = require('../../models/expenseModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const mongoose = require('mongoose');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const Brand = require('../../models/brandModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Contact = require('../../models/contactModel');

exports.getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate, locationId, reportType } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Initialize specialized report data
    let specializedReportData = null;

    // If reportType is specified, get that specific profit report data
    if (reportType) {
      try {
        switch (reportType) {
          case 'products':
            specializedReportData = await getProductsProfitData(req);
            break;
          case 'categories':
            specializedReportData = await getCategoriesProfitData(req);
            break;
          case 'brands':
            specializedReportData = await getBrandsProfitData(req);
            break;
          case 'locations':
            specializedReportData = await getLocationsProfitData(req);
            break;
          case 'invoice':
            specializedReportData = await getInvoiceProfitData(req);
            break;
          case 'date':
            specializedReportData = await getDateProfitData(req);
            break;
          case 'customer':
            specializedReportData = await getCustomerProfitData(req);
            break;
          case 'day':
            specializedReportData = await getDayProfitData(req);
            break;
          default:
            break;
        }
      } catch (error) {
        console.error(`Error generating specialized report for ${reportType}:`, error);
        // Continue with standard report even if specialized report fails
      }
    }

    // Continue with the standard profit/loss report
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
      isDeleted: false
    });

    // Get opening stock (stock before start date)
    const getOpeningStockValue = async () => {
      try {
        console.log('Calculating opening stock value as of', start);

        // Get all stock items as of start date, using the quantity field directly
        const stocks = await Stock.find({
          ...locationFilter,
          isDeleted: false,
          createdAt: { $lt: start },
          quantity: { $gt: 0 } // Only include items with stock
        }).populate('product');

        let purchaseValue = 0;
        let saleValue = 0;

        // Calculate stock values based on the quantity field in stock model
        for (const stock of stocks) {
          if (stock.product) {
            purchaseValue += stock.quantity * stock.unitCost;
            saleValue += stock.quantity * (stock.product.sellingPrice || 0);
          }
        }

        return { purchaseValue, saleValue };
      } catch (error) {
        console.error('Error calculating opening stock:', error);
        return { purchaseValue: 0, saleValue: 0 };
      }
    };

    // Get closing stock (current stock at end date)
    const getClosingStockValue = async () => {
      try {
        console.log('Calculating closing stock value as of', end);

        // Get all stock items as of end date, using the quantity field directly
        const stocks = await Stock.find({
          ...locationFilter,
          isDeleted: false,
          createdAt: { $lte: end },
          quantity: { $gt: 0 } // Only include items with stock
        }).populate('product');

        let purchaseValue = 0;
        let saleValue = 0;

        // Calculate stock values based on the quantity field in stock model
        for (const stock of stocks) {
          if (stock.product) {
            purchaseValue += stock.quantity * stock.unitCost;
            saleValue += stock.quantity * (stock.product.sellingPrice || 0);
          }
        }

        console.log(`Closing stock: Purchase value: ${purchaseValue}, Sale value: ${saleValue}`);
        return { purchaseValue, saleValue };
      } catch (error) {
        console.error('Error calculating closing stock:', error);
        return { purchaseValue: 0, saleValue: 0 };
      }
    };

    // Get total purchases
    const getTotalPurchases = async () => {
      const purchases = await Purchase.find(addFilters({}, 'purchaseDate'));
      return purchases.reduce((total, purchase) => {
        // Use total from purchase document if available
        if (purchase.totalAmountWithGst) return total + purchase.totalAmountWithGst;
        if (purchase.total) return total + purchase.total;

        // Fall back to calculating from products if total isn't available
        const purchaseTotal = purchase.products.reduce((sum, product) => {
          return sum + ((product.quantity || 0) * (product.unitCost || 0));
        }, 0);
        return total + purchaseTotal;
      }, 0);
    };

    // Get total sales
    const getTotalSales = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate'));
      return sales.reduce((total, sale) => {
        // Use total from sale document if available
        if (sale.totalAmountWithGst) return total + sale.totalAmountWithGst;
        if (sale.total) return total + sale.total;

        // Fall back to calculating from products if total isn't available
        const saleTotal = sale.products.reduce((sum, product) => {
          return sum + ((product.quantity || 0) * (product.unitPrice || 0));
        }, 0);
        return total + saleTotal;
      }, 0);
    };

    // Get total expenses
    const getTotalExpenses = async () => {
      const expenses = await Expense.find(addFilters({}, 'transactionDate'));
      return expenses.reduce((total, expense) => {
        return total + (expense.totalAmount || 0);
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
        return total + (ret.totalReturnAmountWithGst || ret.totalReturnAmount || 0);
      }, 0);
    };

    // Get purchase returns
    const getPurchaseReturns = async () => {
      const returns = await PurchaseReturn.find(addFilters({}, 'returnDate'));
      return returns.reduce((total, ret) => {
        return total + (ret.totalReturnAmountWithGst || ret.totalReturnAmount || 0);
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

    // Calculate profit based on individual sale products rather than overall totals
    const getDetailedProfitData = async () => {
      try {
        // Get sales in date range with location filter if provided
        const locationFilter = locationId && locationId !== 'All locations'
          ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
          : {};

        // Aggregate sales to calculate detailed profit - UPDATED to use stock unit cost
        const salesProfit = await Sale.aggregate([
          {
            $match: {
              saleDate: { $gte: start, $lte: end },
              isDeleted: false,
              ...locationFilter
            }
          },
          { $unwind: '$products' },
          {
            $lookup: {
              from: 'stocks',
              localField: 'products.stockId',
              foreignField: '_id',
              as: 'stockData'
            }
          },
          { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
              totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
            }
          }
        ]);

        // Aggregate sale returns to calculate detailed returns
        const saleReturnsLoss = await SaleReturn.aggregate([
          {
            $match: {
              returnDate: { $gte: start, $lte: end },
              isDeleted: false,
              ...locationFilter
            }
          },
          { $unwind: '$returnedProducts' },
          {
            $group: {
              _id: null,
              totalReturnSales: { $sum: { $multiply: ['$returnedProducts.quantity', { $ifNull: ['$returnedProducts.unitCost', 0] }] } },
            }
          }
        ]);

        // Aggregate purchase returns to calculate detailed purchase returns
        const purchaseReturnsGain = await PurchaseReturn.aggregate([
          {
            $match: {
              returnDate: { $gte: start, $lte: end },
              isDeleted: false,
              ...locationFilter
            }
          },
          { $unwind: '$returnedProducts' },
          {
            $group: {
              _id: null,
              totalPurchaseReturns: { $sum: { $multiply: ['$returnedProducts.quantity', { $ifNull: ['$returnedProducts.unitCost', 0] }] } },
            }
          }
        ]);

        const salesProfitAmount = salesProfit.length > 0 ?
          salesProfit[0].totalSales - salesProfit[0].totalCost : 0;

        const saleReturnsAmount = saleReturnsLoss.length > 0 ?
          saleReturnsLoss[0].totalReturnSales : 0;

        const purchaseReturnsAmount = purchaseReturnsGain.length > 0 ?
          purchaseReturnsGain[0].totalPurchaseReturns : 0;

        return {
          salesProfit: salesProfitAmount,
          saleReturns: saleReturnsAmount,
          purchaseReturns: purchaseReturnsAmount
        };
      } catch (error) {
        console.error('Error calculating detailed profit data:', error);
        return {
          salesProfit: 0,
          saleReturns: 0,
          purchaseReturns: 0
        };
      }
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
      stockRecovered,
      detailedProfitData
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
      getStockRecovered(),
      getDetailedProfitData()
    ]);

    // Calculate Gross Profit using individual sales data
    // Gross profit = Sales profit - Sale returns + Purchase returns
    const grossProfit = detailedProfitData.salesProfit - detailedProfitData.saleReturns + detailedProfitData.purchaseReturns;

    // Calculate Net Profit based on the new gross profit calculation
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
        byPurchasePrice: parseFloat(openingStock.purchaseValue).toFixed(2),
        bySalePrice: parseFloat(openingStock.saleValue).toFixed(2)
      },
      totalPurchase: parseFloat(totalPurchase).toFixed(2),
      totalStockAdjustment: parseFloat(stockAdjustment).toFixed(2),
      totalExpense: parseFloat(totalExpense).toFixed(2),
      totalPurchaseShippingCharge: parseFloat(purchaseShippingCharge).toFixed(2),
      purchaseAdditionalExpenses: parseFloat(purchaseAdditionalExpenses).toFixed(2),
      totalTransferShippingCharge: parseFloat(transferShippingCharge).toFixed(2),
      totalSellDiscount: parseFloat(sellDiscount).toFixed(2),
      totalCustomerReward: parseFloat(customerReward).toFixed(2),
      totalSaleReturn: parseFloat(saleReturn).toFixed(2),

      // Right column (income)
      closingStock: {
        byPurchasePrice: parseFloat(closingStock.purchaseValue).toFixed(2),
        bySalePrice: parseFloat(closingStock.saleValue).toFixed(2)
      },
      totalSales: parseFloat(totalSales).toFixed(2),
      totalSellShippingCharge: parseFloat(sellShippingCharge).toFixed(2),
      sellAdditionalExpenses: parseFloat(sellAdditionalExpenses).toFixed(2),
      totalStockRecovered: parseFloat(stockRecovered).toFixed(2),
      totalPurchaseReturn: parseFloat(purchaseReturn).toFixed(2),
      totalPurchaseDiscount: parseFloat(purchaseDiscount).toFixed(2),
      totalSellRoundOff: parseFloat(sellRoundOff).toFixed(2),

      // Profit calculations
      grossProfit: parseFloat(grossProfit).toFixed(2),
      netProfit: parseFloat(netProfit).toFixed(2)
    };

    // Add specialized report data if available
    if (specializedReportData) {
      report.specializedReport = {
        type: reportType,
        data: specializedReportData
      };
    }

    res.status(200).json(report);
  } catch (err) {
    console.error('Error generating profit/loss report:', err);
    res.status(500).json({ error: err.message || 'Error generating profit/loss report' });
  }
};

// Internal helper functions for different profit report types
async function getProfitByProducts(req, res) {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all sales within date range and with location filter if provided
    const locationFilter = locationId && locationId !== 'All locations'
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
      : {};

    // Aggregate sales to calculate profit by product
    const productProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'stocks',
          localField: 'products.stockId',
          foreignField: '_id',
          as: 'stockData'
        }
      },
      { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'products',
          localField: 'products.product',
          foreignField: '_id',
          as: 'productData'
        }
      },
      { $unwind: '$productData' },
      {
        $group: {
          _id: '$products.product',
          product: { $first: '$productData.productName' },
          sku: { $first: '$productData.sku' },
          totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
          totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
        }
      },
      {
        $project: {
          _id: 1,
          product: 1,
          sku: 1,
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { grossProfit: -1 } }
    ]);

    // Calculate total profit
    const total = productProfits.reduce((sum, item) => sum + item.grossProfit, 0);

    return {
      data: productProfits,
      total
    };
  } catch (err) {
    console.error('Error generating profit by products report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

async function getProfitByCategories(req, res) {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all sales within date range and with location filter if provided
    const locationFilter = locationId && locationId !== 'All locations'
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
      : {};

    // Aggregate sales to calculate profit by category
    const categoryProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'stocks',
          localField: 'products.stockId',
          foreignField: '_id',
          as: 'stockData'
        }
      },
      { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'products',
          localField: 'products.product',
          foreignField: '_id',
          as: 'productData'
        }
      },
      { $unwind: '$productData' },
      {
        $lookup: {
          from: 'categories',
          localField: 'productData.category',
          foreignField: '_id',
          as: 'categoryData'
        }
      },
      {
        $unwind: {
          path: '$categoryData',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: '$productData.category',
          category: { $first: { $ifNull: ['$categoryData.name', 'Uncategorized'] } },
          totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
          totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
        }
      },
      {
        $project: {
          _id: 1,
          category: 1,
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { grossProfit: -1 } }
    ]);

    // Calculate total
    const total = categoryProfits.reduce((sum, item) => sum + item.grossProfit, 0);

    return res.status(200).json({
      success: true,
      data: categoryProfits,
      total
    });
  } catch (err) {
    console.error('Error generating profit by categories report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

async function getProfitByBrands(req, res) {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all sales within date range and with location filter if provided
    const locationFilter = locationId && locationId !== 'All locations'
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
      : {};

    // Aggregate sales to calculate profit by brand
    const brandProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'stocks',
          localField: 'products.stockId',
          foreignField: '_id',
          as: 'stockData'
        }
      },
      { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'products',
          localField: 'products.product',
          foreignField: '_id',
          as: 'productData'
        }
      },
      { $unwind: '$productData' },
      {
        $lookup: {
          from: 'brands',
          localField: 'productData.brand',
          foreignField: '_id',
          as: 'brandData'
        }
      },
      {
        $unwind: {
          path: '$brandData',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: '$productData.brand',
          brand: { $first: { $ifNull: ['$brandData.name', 'No Brand'] } },
          totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
          totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
        }
      },
      {
        $project: {
          _id: 1,
          brand: 1,
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { grossProfit: -1 } }
    ]);

    // Calculate total profit
    const total = brandProfits.reduce((sum, item) => sum + item.grossProfit, 0);

    return {
      data: brandProfits,
      total
    };
  } catch (err) {
    console.error('Error generating profit by brands report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

async function getProfitByLocations(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Aggregate sales to calculate profit by location
    const locationProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'businesslocations',
          localField: 'businessLocation',
          foreignField: '_id',
          as: 'locationData'
        }
      },
      {
        $unwind: '$locationData'
      },
      {
        $group: {
          _id: '$businessLocation',
          location: { $first: '$locationData.name' },
          totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
          totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$products.originalUnitCost', 0] }] } },
        }
      },
      {
        $project: {
          _id: 1,
          location: 1,
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { location: 1 } }
    ]);

    // Calculate total
    const total = locationProfits.reduce((sum, item) => sum + item.grossProfit, 0);

    return res.status(200).json({
      success: true,
      data: locationProfits,
      total
    });
  } catch (err) {
    console.error('Error generating profit by locations report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

async function getProfitByInvoice(req, res) {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all sales within date range and with location filter if provided
    const locationFilter = locationId && locationId !== 'All locations'
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
      : {};

    // Aggregate sales to calculate profit by invoice - UPDATED
    const invoiceProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'stocks',
          localField: 'products.stockId',
          foreignField: '_id',
          as: 'stockData'
        }
      },
      { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$_id',
          invoiceNo: { $first: '$invoiceNo' },
          saleDate: { $first: '$saleDate' },
          totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
          totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
        }
      },
      {
        $project: {
          _id: 1,
          invoiceNo: 1,
          saleDate: 1,
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { saleDate: -1 } }
    ]);

    // Calculate total profit
    const total = invoiceProfits.reduce((sum, item) => sum + item.grossProfit, 0);

    return {
      data: invoiceProfits,
      total
    };
  } catch (err) {
    console.error('Error generating profit by invoice report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

async function getProfitByDate(req, res) {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all sales within date range and with location filter if provided
    const locationFilter = locationId && locationId !== 'All locations'
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
      : {};

    // Aggregate sales to calculate profit by date - UPDATED
    const dateProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'stocks',
          localField: 'products.stockId',
          foreignField: '_id',
          as: 'stockData'
        }
      },
      { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          saleDate: {
            $dateToString: { format: '%Y-%m-%d', date: '$saleDate' }
          },
          productSales: { $multiply: ['$products.quantity', '$products.unitPrice'] },
          productCost: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] }
        }
      },
      {
        $group: {
          _id: '$saleDate',
          date: { $first: '$saleDate' },
          totalSales: { $sum: '$productSales' },
          totalCost: { $sum: '$productCost' }
        }
      },
      {
        $project: {
          _id: 0,
          date: 1,
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { date: -1 } }
    ]);

    // Calculate total profit
    const total = dateProfits.reduce((sum, item) => sum + item.grossProfit, 0);

    return {
      data: dateProfits,
      total
    };
  } catch (err) {
    console.error('Error generating profit by date report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

async function getProfitByCustomer(req, res) {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all sales within date range and with location filter if provided
    const locationFilter = locationId && locationId !== 'All locations'
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
      : {};

    // Aggregate sales to calculate profit by customer - UPDATED
    const customerProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'stocks',
          localField: 'products.stockId',
          foreignField: '_id',
          as: 'stockData'
        }
      },
      { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'contacts',
          localField: 'customer',
          foreignField: '_id',
          as: 'customerData'
        }
      },
      {
        $unwind: {
          path: '$customerData',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          customer: 1,
          customerName: {
            $cond: [
              { $ifNull: ['$customerData.businessName', false] },
              {
                $concat: [
                  '$customerData.businessName',
                  ' ',
                  { $ifNull: ['$customerData.firstName', ''] },
                  ' ',
                  { $ifNull: ['$customerData.lastName', ''] }
                ]
              },
              {
                $concat: [
                  { $ifNull: ['$customerData.firstName', ''] },
                  ' ',
                  { $ifNull: ['$customerData.lastName', ''] }
                ]
              }
            ]
          },
          productSales: { $multiply: ['$products.quantity', '$products.unitPrice'] },
          productCost: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] }
        }
      },
      {
        $group: {
          _id: '$customer',
          customerName: { $first: '$customerName' },
          totalSales: { $sum: '$productSales' },
          totalCost: { $sum: '$productCost' }
        }
      },
      {
        $project: {
          _id: 1,
          customerName: 1,
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { grossProfit: -1 } }
    ]);

    // Calculate total profit
    const total = customerProfits.reduce((sum, item) => sum + item.grossProfit, 0);

    return {
      data: customerProfits,
      total
    };
  } catch (err) {
    console.error('Error generating profit by customer report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

async function getProfitByDay(req, res) {
  try {
    const { startDate, endDate, locationId } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get all sales within date range and with location filter if provided
    const locationFilter = locationId && locationId !== 'All locations'
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
      : {};

    // Aggregate sales to calculate profit by day of week - UPDATED
    const dayProfits = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: start, $lte: end },
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'stocks',
          localField: 'products.stockId',
          foreignField: '_id',
          as: 'stockData'
        }
      },
      { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          dayOfWeek: { $dayOfWeek: '$saleDate' },
          productSales: { $multiply: ['$products.quantity', '$products.unitPrice'] },
          productCost: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] }
        }
      },
      {
        $group: {
          _id: '$dayOfWeek',
          totalSales: { $sum: '$productSales' },
          totalCost: { $sum: '$productCost' }
        }
      },
      {
        $project: {
          _id: 1,
          dayName: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 1] }, then: 'Sunday' },
                { case: { $eq: ['$_id', 2] }, then: 'Monday' },
                { case: { $eq: ['$_id', 3] }, then: 'Tuesday' },
                { case: { $eq: ['$_id', 4] }, then: 'Wednesday' },
                { case: { $eq: ['$_id', 5] }, then: 'Thursday' },
                { case: { $eq: ['$_id', 6] }, then: 'Friday' },
                { case: { $eq: ['$_id', 7] }, then: 'Saturday' }
              ],
              default: 'Unknown'
            }
          },
          grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
        }
      },
      { $sort: { _id: 1 } } // Sort by day of week
    ]);

    // Calculate total profit
    const totalProfit = dayProfits.reduce((sum, day) => sum + day.grossProfit, 0);

    return res.status(200).json({
      success: true,
      data: dayProfits,
      total: totalProfit
    });
  } catch (err) {
    console.error('Error generating profit by day report:', err);
    return res.status(500).json({ error: err.message || 'Error generating profit report' });
  }
}

// Helper functions for specialized reports

// Products profit data
async function getProductsProfitData(req) {
  const { startDate, endDate, locationId } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const locationFilter = locationId && locationId !== 'All locations'
    ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
    : {};

  const productProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
        ...locationFilter
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        localField: 'products.product',
        foreignField: '_id',
        as: 'productData'
      }
    },
    { $unwind: '$productData' },
    {
      $group: {
        _id: '$products.product',
        product: { $first: '$productData.productName' },
        sku: { $first: '$productData.sku' },
        totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
        totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
      }
    },
    {
      $project: {
        _id: 1,
        product: 1,
        sku: 1,
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { grossProfit: -1 } }
  ]);

  // Calculate total profit
  const total = productProfits.reduce((sum, item) => sum + item.grossProfit, 0);

  return {
    data: productProfits,
    total
  };
}

// Categories profit data
async function getCategoriesProfitData(req) {
  const { startDate, endDate, locationId } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const locationFilter = locationId && locationId !== 'All locations'
    ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
    : {};

  const categoryProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
        ...locationFilter
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        localField: 'products.product',
        foreignField: '_id',
        as: 'productData'
      }
    },
    { $unwind: '$productData' },
    {
      $lookup: {
        from: 'categories',
        localField: 'productData.category',
        foreignField: '_id',
        as: 'categoryData'
      }
    },
    {
      $unwind: {
        path: '$categoryData',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: '$productData.category',
        category: { $first: { $ifNull: ['$categoryData.name', 'Uncategorized'] } },
        totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
        totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
      }
    },
    {
      $project: {
        _id: 1,
        category: 1,
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { grossProfit: -1 } }
  ]);

  // Calculate total
  const total = categoryProfits.reduce((sum, item) => sum + item.grossProfit, 0);

  return {
    data: categoryProfits,
    total
  };
}

// Brands profit data
async function getBrandsProfitData(req) {
  const { startDate, endDate, locationId } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const locationFilter = locationId && locationId !== 'All locations'
    ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
    : {};

  const brandProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
        ...locationFilter
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        localField: 'products.product',
        foreignField: '_id',
        as: 'productData'
      }
    },
    { $unwind: '$productData' },
    {
      $lookup: {
        from: 'brands',
        localField: 'productData.brand',
        foreignField: '_id',
        as: 'brandData'
      }
    },
    {
      $unwind: {
        path: '$brandData',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: '$productData.brand',
        brand: { $first: { $ifNull: ['$brandData.name', 'No Brand'] } },
        totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
        totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
      }
    },
    {
      $project: {
        _id: 1,
        brand: 1,
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { grossProfit: -1 } }
  ]);

  // Calculate total profit
  const total = brandProfits.reduce((sum, item) => sum + item.grossProfit, 0);

  return {
    data: brandProfits,
    total
  };
}

// Locations profit data
async function getLocationsProfitData(req) {
  const { startDate, endDate } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Aggregate sales to calculate profit by location - UPDATED
  const locationProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'businesslocations',
        localField: 'businessLocation',
        foreignField: '_id',
        as: 'locationData'
      }
    },
    {
      $unwind: '$locationData'
    },
    {
      $group: {
        _id: '$businessLocation',
        location: { $first: '$locationData.name' },
        totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
        totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
      }
    },
    {
      $project: {
        _id: 1,
        location: 1,
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { location: 1 } }
  ]);

  // Calculate total
  const total = locationProfits.reduce((sum, item) => sum + item.grossProfit, 0);

  return {
    data: locationProfits,
    total
  };
}

// Invoice profit data
async function getInvoiceProfitData(req) {
  const { startDate, endDate, locationId } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Get all sales within date range and with location filter if provided
  const locationFilter = locationId && locationId !== 'All locations'
    ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
    : {};

  // Aggregate sales to calculate profit by invoice - UPDATED
  const invoiceProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
        ...locationFilter
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$_id',
        invoiceNo: { $first: '$invoiceNo' },
        saleDate: { $first: '$saleDate' },
        totalSales: { $sum: { $multiply: ['$products.quantity', '$products.unitPrice'] } },
        totalCost: { $sum: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] } },
      }
    },
    {
      $project: {
        _id: 1,
        invoiceNo: 1,
        saleDate: 1,
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { saleDate: -1 } }
  ]);

  // Calculate total profit
  const total = invoiceProfits.reduce((sum, item) => sum + item.grossProfit, 0);

  return {
    data: invoiceProfits,
    total
  };
}

// Date profit data
async function getDateProfitData(req) {
  const { startDate, endDate, locationId } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Get all sales within date range and with location filter if provided
  const locationFilter = locationId && locationId !== 'All locations'
    ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
    : {};

  // Aggregate sales to calculate profit by date - UPDATED
  const dateProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
        ...locationFilter
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        saleDate: {
          $dateToString: { format: '%Y-%m-%d', date: '$saleDate' }
        },
        productSales: { $multiply: ['$products.quantity', '$products.unitPrice'] },
        productCost: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] }
      }
    },
    {
      $group: {
        _id: '$saleDate',
        date: { $first: '$saleDate' },
        totalSales: { $sum: '$productSales' },
        totalCost: { $sum: '$productCost' }
      }
    },
    {
      $project: {
        _id: 0,
        date: 1,
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { date: -1 } }
  ]);

  // Calculate total profit
  const total = dateProfits.reduce((sum, item) => sum + item.grossProfit, 0);

  return {
    data: dateProfits,
    total
  };
}

// Customer profit data
async function getCustomerProfitData(req) {
  const { startDate, endDate, locationId } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Get all sales within date range and with location filter if provided
  const locationFilter = locationId && locationId !== 'All locations'
    ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
    : {};

  // Aggregate sales to calculate profit by customer - UPDATED
  const customerProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
        ...locationFilter
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'contacts',
        localField: 'customer',
        foreignField: '_id',
        as: 'customerData'
      }
    },
    {
      $unwind: {
        path: '$customerData',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        _id: 1,
        customer: 1,
        customerName: {
          $cond: [
            { $ifNull: ['$customerData.businessName', false] },
            {
              $concat: [
                '$customerData.businessName',
                ' ',
                { $ifNull: ['$customerData.firstName', ''] },
                ' ',
                { $ifNull: ['$customerData.lastName', ''] }
              ]
            },
            {
              $concat: [
                { $ifNull: ['$customerData.firstName', ''] },
                ' ',
                { $ifNull: ['$customerData.lastName', ''] }
              ]
            }
          ]
        },
        productSales: { $multiply: ['$products.quantity', '$products.unitPrice'] },
        productCost: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] }
      }
    },
    {
      $group: {
        _id: '$customer',
        customerName: { $first: '$customerName' },
        totalSales: { $sum: '$productSales' },
        totalCost: { $sum: '$productCost' }
      }
    },
    {
      $project: {
        _id: 1,
        customerName: 1,
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { grossProfit: -1 } }
  ]);

  // Calculate total profit
  const total = customerProfits.reduce((sum, item) => sum + item.grossProfit, 0);

  return {
    data: customerProfits,
    total
  };
}

// Day profit data
async function getDayProfitData(req) {
  const { startDate, endDate, locationId } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Get all sales within date range and with location filter if provided
  const locationFilter = locationId && locationId !== 'All locations'
    ? { businessLocation: new mongoose.Types.ObjectId(locationId) }
    : {};

  // Aggregate sales to calculate profit by day of week - UPDATED
  const dayProfits = await Sale.aggregate([
    {
      $match: {
        saleDate: { $gte: start, $lte: end },
        isDeleted: false,
        ...locationFilter
      }
    },
    { $unwind: '$products' },
    {
      $lookup: {
        from: 'stocks',
        localField: 'products.stockId',
        foreignField: '_id',
        as: 'stockData'
      }
    },
    { $unwind: { path: '$stockData', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        dayOfWeek: { $dayOfWeek: '$saleDate' },
        productSales: { $multiply: ['$products.quantity', '$products.unitPrice'] },
        productCost: { $multiply: ['$products.quantity', { $ifNull: ['$stockData.unitCost', 0] }] }
      }
    },
    {
      $group: {
        _id: '$dayOfWeek',
        totalSales: { $sum: '$productSales' },
        totalCost: { $sum: '$productCost' }
      }
    },
    {
      $project: {
        _id: 1,
        dayName: {
          $switch: {
            branches: [
              { case: { $eq: ['$_id', 1] }, then: 'Sunday' },
              { case: { $eq: ['$_id', 2] }, then: 'Monday' },
              { case: { $eq: ['$_id', 3] }, then: 'Tuesday' },
              { case: { $eq: ['$_id', 4] }, then: 'Wednesday' },
              { case: { $eq: ['$_id', 5] }, then: 'Thursday' },
              { case: { $eq: ['$_id', 6] }, then: 'Friday' },
              { case: { $eq: ['$_id', 7] }, then: 'Saturday' }
            ],
            default: 'Unknown'
          }
        },
        grossProfit: { $subtract: ['$totalSales', '$totalCost'] }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Calculate total profit
  const total = dayProfits.reduce((sum, day) => sum + day.grossProfit, 0);

  return {
    data: dayProfits,
    total
  };
}
