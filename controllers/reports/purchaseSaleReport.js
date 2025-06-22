const Purchase = require('../../models/purchaseModel');
const Sale = require('../../models/saleModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const SaleReturn = require('../../models/saleReturnModel');
const mongoose = require('mongoose');

exports.getPurchaseSaleReport = async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const locationFilter = locationId && locationId !== 'All locations' 
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) } 
      : {};
    
    // Define date ranges
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Set to end of day

    // Helper function for date and location filters
    const addFilters = (query, dateField) => ({
      ...query,
      ...locationFilter,
      [dateField]: { $gte: start, $lte: end },
      isDeleted: { $ne: true }
    });

    // GET PURCHASE DATA
    // Get total purchase amount
    const getTotalPurchase = async () => {
      const purchases = await Purchase.find(addFilters({}, 'purchaseDate')).lean();
      return purchases.reduce((total, purchase) => {
        // Use total field instead of grandTotal which doesn't exist
        const purchaseTotal = purchase.total || 0;
        return total + purchaseTotal;
      }, 0);
    };

    // Get total purchase including tax
    const getPurchaseIncludingTax = async () => {
      const purchases = await Purchase.find(addFilters({}, 'purchaseDate')).lean();
      return purchases.reduce((total, purchase) => {
        // Use totalAmountWithGst if available, otherwise fall back to total
        const totalWithTax = purchase.totalAmountWithGst || purchase.total || 0;
        return total + totalWithTax;
      }, 0);
    };

    // Get total purchase return including tax
    const getPurchaseReturnIncludingTax = async () => {
      const returns = await PurchaseReturn.find(addFilters({}, 'returnDate')).lean();
      return returns.reduce((total, ret) => {
        // Use totalReturnAmountWithGst if available, otherwise use totalReturnAmount
        return total + (ret.totalReturnAmountWithGst || ret.totalReturnAmount || 0);
      }, 0);
    };

    // Get purchase dues (unpaid amounts)
    const getPurchaseDue = async () => {
      const purchases = await Purchase.find({
        ...addFilters({}, 'purchaseDate'),
        paymentStatus: { $in: ['due', 'partial'] }
      }).lean();
      
      return purchases.reduce((total, purchase) => {
        return total + (purchase.paymentDue || 0);
      }, 0);
    };

    // GET SALE DATA
    // Get total sale amount
    const getTotalSale = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate')).lean();
      return sales.reduce((total, sale) => {
        // Use total field instead of grandTotal which doesn't exist
        const saleTotal = sale.total || 0;
        return total + saleTotal;
      }, 0);
    };

    // Get total sale including tax
    const getSaleIncludingTax = async () => {
      const sales = await Sale.find(addFilters({}, 'saleDate')).lean();
      return sales.reduce((total, sale) => {
        // Use totalAmountWithGst if available, otherwise fall back to total
        const totalWithTax = sale.totalAmountWithGst || sale.total || 0;
        return total + totalWithTax;
      }, 0);
    };

    // Get total sale return including tax
    const getSaleReturnIncludingTax = async () => {
      const returns = await SaleReturn.find(addFilters({}, 'returnDate')).lean();
      return returns.reduce((total, ret) => {
        // Use totalReturnAmountWithGst if available, otherwise use totalReturnAmount
        return total + (ret.totalReturnAmountWithGst || ret.totalReturnAmount || 0);
      }, 0);
    };

    // Get sale dues (unpaid amounts)
    const getSaleDue = async () => {
      const sales = await Sale.find({
        ...addFilters({}, 'saleDate'),
        paymentStatus: { $in: ['due', 'partial'] }
      }).lean();
      
      return sales.reduce((total, sale) => {
        return total + (sale.paymentDue || 0);
      }, 0);
    };

    // Execute all queries concurrently
    const [
      totalPurchase,
      purchaseIncludingTax,
      purchaseReturnIncludingTax,
      purchaseDue,
      totalSale,
      saleIncludingTax,
      saleReturnIncludingTax,
      saleDue
    ] = await Promise.all([
      getTotalPurchase(),
      getPurchaseIncludingTax(),
      getPurchaseReturnIncludingTax(),
      getPurchaseDue(),
      getTotalSale(),
      getSaleIncludingTax(),
      getSaleReturnIncludingTax(),
      getSaleDue()
    ]);

    // Calculate the overall result
    // Overall = (Sale - Sale Return) - (Purchase - Purchase Return)
    const netSale = totalSale - saleReturnIncludingTax;
    const netPurchase = totalPurchase - purchaseReturnIncludingTax;
    const overall = netSale - netPurchase;

    // Calculate due amount difference (Sale due - Purchase due)
    const dueAmountDiff = saleDue - purchaseDue;

    console.log('Report values:', {
      totalPurchase,
      purchaseIncludingTax,
      purchaseReturnIncludingTax,
      purchaseDue,
      totalSale,
      saleIncludingTax,
      saleReturnIncludingTax,
      saleDue
    });

    const report = {
      startDate,
      endDate,
      locationId: locationId || 'All locations',
      
      // Purchase data
      purchase: {
        totalPurchase: totalPurchase.toFixed(2),
        purchaseIncludingTax: purchaseIncludingTax.toFixed(2),
        purchaseReturnIncludingTax: purchaseReturnIncludingTax.toFixed(2),
        purchaseDue: purchaseDue.toFixed(2)
      },
      
      // Sale data
      sale: {
        totalSale: totalSale.toFixed(2),
        saleIncludingTax: saleIncludingTax.toFixed(2),
        saleReturnIncludingTax: saleReturnIncludingTax.toFixed(2),
        saleDue: saleDue.toFixed(2)
      },
      
      // Summary calculations
      summary: {
        overall: overall.toFixed(2),
        dueAmount: dueAmountDiff.toFixed(2)
      }
    };

    res.status(200).json(report);
  } catch (err) {
    console.error('Error generating purchase & sale report:', err);
    res.status(500).json({ error: err.message || 'Error generating purchase & sale report' });
  }
};
