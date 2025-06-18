const Sale = require('../../models/saleModel');
const SaleReturn = require('../../models/saleReturnModel');
const Purchase = require('../../models/purchaseModel');
const Stock = require('../../models/stockModel');
const generateAutoId = require('../../utils/generateAutoId');
const createStock = require('../../utils/createStock');

exports.addSaleReturn = async (req, res) => {
  try {
    const oldSaleId = req.params.oldSaleId;
    const { businessLocation, products = [], totalReturnAmount } = req.body;
    const addedBy = req.user._id;

    // Validate request data
    if (!oldSaleId || !businessLocation || !products.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find the original sale
    const sale = await Sale.findById(oldSaleId);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Original sale not found' });
    }

    if (sale.businessLocation.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Sale does not belong to the given business location' });
    }

    // Validate all products before processing
    const inputProductsMap = {};
    for (const item of products) {
      if (!item.productId || typeof item.unitCost !== 'number') {
        return res.status(400).json({ error: 'Each product must include productId and unitCost' });
      }

      // Validate return quantity
      const returnQuantity = item.quantity || 1;
      if (returnQuantity <= 0) {
        return res.status(400).json({ 
          error: `Return quantity must be greater than 0, got ${returnQuantity}` 
        });
      }

      inputProductsMap[item.productId] = {
        unitCost: item.unitCost,
        quantity: returnQuantity
      };
    }

    // First validate all products before making any changes
    const saleProductsToValidate = [];

    for (const saleProduct of sale.products) {
      const saleProdIdStr = saleProduct.product.toString();
      const inputProduct = inputProductsMap[saleProdIdStr];
      
      if (!inputProduct) {
        continue; // Skip products not in the return request
      }

      // Check if product is already returned
      if (saleProduct.isReturn) {
        return res.status(400).json({
          error: `Product ${saleProdIdStr} has already been returned on ${saleProduct.returnDate}.`
        });
      }

      // Validate return quantity doesn't exceed sold quantity
      if (inputProduct.quantity > saleProduct.quantity) {
        return res.status(400).json({
          error: `Cannot return ${inputProduct.quantity} units of product ${saleProdIdStr}. Only ${saleProduct.quantity} were sold.`
        });
      }

      // Check if product has a valid stock entry
      if (!saleProduct.stockId) {
        return res.status(400).json({
          error: `Product ${saleProdIdStr} cannot be returned as it has no associated stock.`
        });
      }

      // Check if the product was actually sold (has quantity)
      if (saleProduct.quantity <= 0) {
        return res.status(400).json({
          error: `Cannot return product ${saleProdIdStr} as it was not actually sold (zero quantity).`
        });
      }

      // Verify stock status - for items with IMEI, need to check if they've already been returned to stock
      if (saleProduct.imeiNo) {
        const stock = await Stock.findById(saleProduct.stockId);
        if (!stock) {
          return res.status(400).json({
            error: `Stock record not found for product ${saleProdIdStr} with IMEI ${saleProduct.imeiNo}.`
          });
        }
        
        // For IMEI devices, status 1 means already available (possibly already returned)
        if (stock.status === 1) {
          return res.status(400).json({
            error: `Product ${saleProdIdStr} with IMEI ${saleProduct.imeiNo} appears to be already returned (stock shows as available).`
          });
        }
      }
      
      saleProductsToValidate.push({
        ...saleProduct.toObject(),
        unitCost: inputProduct.unitCost,
        quantity: inputProduct.quantity
      });
      
      // Mark as processed
      delete inputProductsMap[saleProdIdStr];
    }

    // Check if there are any unmatched products in the input
    if (Object.keys(inputProductsMap).length > 0) {
      return res.status(400).json({ 
        error: `Some products not found in the original sale: ${Object.keys(inputProductsMap).join(', ')}` 
      });
    }

    // All validations passed, now we can proceed with the return process
    const returnDate = new Date();
    const matchedSaleProducts = saleProductsToValidate;

    // Update the sale document — mark specific products as returned
    sale.products = sale.products.map(p => {
      const matched = matchedSaleProducts.find(mp => mp._id.toString() === p._id.toString());
      if (matched) {
        return { ...p.toObject(), isReturn: true, returnDate };
      }
      return p;
    });
    await sale.save();

    // Skip marking stock as available - we'll create new stock entries via the purchase instead
    // This ensures returned items become new inventory rather than modifying existing stock

    const refNo = await generateAutoId('SALERET');

    // Create SaleReturn entry
    const saleReturn = await SaleReturn.create({
      originalSale: sale._id,
      businessLocation,
      referenceNo: refNo,
      returnedProducts: matchedSaleProducts.map(p => ({
        product: p.product,
        stockId: p.stockId, // Original stock ID for reference
        unitCost: p.unitCost,
        color: p.color,
        storage: p.storage,
        imeiNo: p.imeiNo,
        serialNo: p.serialNo,
        quantity: p.quantity,
        lineTotal: p.unitCost * p.quantity,
        gstApplicable: p.gstApplicable || false,
        gstPercentage: p.gstPercentage || 18,
        gstAmount: p.gstAmount || 0,
        lineTotalWithGst: p.lineTotalWithGst || (p.unitCost * p.quantity),
      })),
      totalReturnAmount,
      paymentStatus: 'due',
      paymentDue: totalReturnAmount,
      returnDate,
      addedBy
    });
    
    // Prepare products for new stock creation
    const productsForStock = matchedSaleProducts.map(p => ({
      product: p.product,
      serialNo: p.serialNo,
      imeiNo: p.imeiNo,
      color: p.color,
      storage: p.storage,
      unitCost: p.unitCost,
      quantity: p.quantity,
      gstApplicable: p.gstApplicable || false,
      gstPercentage: p.gstPercentage || 18
    }));
    
    // Create new stock entries for returned products
    const productsWithNewStock = await createStock(productsForStock, null, businessLocation);

    // Create Purchase entry with the newly created stock IDs
    const purchase = await Purchase.create({
      referenceNo: refNo,
      supplier: sale.customer || null,
      purchaseDate: returnDate,
      businessLocation,
      products: productsWithNewStock.map((p, index) => ({
        product: p.product,
        stockId: p.stockId, // New stock ID from createStock
        color: p.color,
        storage: p.storage,
        imeiNo: p.imeiNo,
        serialNo: p.serialNo,
        unitCost: p.unitCost,
        lineTotal: p.unitCost * p.quantity,
        quantity: p.quantity,
        isReturn: true,
        returnDate,
        gstApplicable: p.gstApplicable || false,
        gstPercentage: p.gstPercentage || 18,
        gstAmount: matchedSaleProducts[index]?.gstAmount || 0,
        lineTotalWithGst: matchedSaleProducts[index]?.lineTotalWithGst || (p.unitCost * p.quantity),
      })),
      total: totalReturnAmount,
      paymentDue: totalReturnAmount,
      status: 'return',
      paymentStatus: 'due',
      addedBy: req.user._id,
      createdFromReturn: true,
      saleReturnRef: saleReturn._id,
      totalGstAmount: saleReturn.totalGstAmount || 0,
      totalAmountWithGst: saleReturn.totalReturnAmountWithGst || 0
    });

    // Update sale return with the purchase ID
    await SaleReturn.findByIdAndUpdate(saleReturn._id, { newPurchase: purchase._id });

    res.status(201).json({
      message: 'Sale return processed successfully',
      saleReturnId: saleReturn._id,
      purchaseId: purchase._id
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};