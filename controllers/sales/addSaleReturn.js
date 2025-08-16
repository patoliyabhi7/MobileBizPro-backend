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

      // Handle IMEI-based products and accessories differently
      if (saleProduct.imeiNo) {
        // For IMEI products, check if already returned
        if (saleProduct.isReturn) {
          return res.status(400).json({
            error: `Product ${saleProdIdStr} with IMEI ${saleProduct.imeiNo} has already been returned on ${saleProduct.returnDate}.`
          });
        }

        // Check if product has a valid stock entry
        if (!saleProduct.stockId) {
          return res.status(400).json({
            error: `Product ${saleProdIdStr} cannot be returned as it has no associated stock.`
          });
        }

        // Verify stock status - for items with IMEI, need to check if they've already been returned to stock
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
      } else {
        // For accessories/non-IMEI products, check remaining quantity that can be returned
        const alreadyReturnedQty = saleProduct.noOfReturnProduct || 0;
        const remainingQty = saleProduct.quantity - alreadyReturnedQty;

        if (remainingQty <= 0) {
          return res.status(400).json({
            error: `Product ${saleProdIdStr} has already been fully returned (${alreadyReturnedQty} of ${saleProduct.quantity}).`
          });
        }

        // Validate return quantity doesn't exceed remaining quantity
        if (inputProduct.quantity > remainingQty) {
          return res.status(400).json({
            error: `Cannot return ${inputProduct.quantity} units of product ${saleProdIdStr}. Only ${remainingQty} of ${saleProduct.quantity} are available for return.`
          });
        }
      }

      // Check if the product was actually sold (has quantity)
      if (saleProduct.quantity <= 0) {
        return res.status(400).json({
          error: `Cannot return product ${saleProdIdStr} as it was not actually sold (zero quantity).`
        });
      }
      
      // Prioritize using originalUnitCost directly from the sale record
      // We'll only perform lookups if the original cost isn't already stored
      let originalUnitCost = null;
      
      if (saleProduct.originalUnitCost) {
        // Use the original cost directly from the sale record if available
        originalUnitCost = saleProduct.originalUnitCost;
      } else if (saleProduct.purchaseRef) {
        // If we have a purchaseRef but no originalUnitCost, look up the purchase cost
        try {
          const purchase = await Purchase.findById(saleProduct.purchaseRef);
          if (purchase) {
            const purchaseProduct = purchase.products.find(p => 
              p.product.toString() === saleProdIdStr &&
              (!saleProduct.imeiNo || p.imeiNo === saleProduct.imeiNo)
            );
            if (purchaseProduct) {
              originalUnitCost = purchaseProduct.unitCost;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch purchase ref for product ${saleProdIdStr}:`, err);
        }
      }
      
      // Last resort: check the stock record if we still don't have a cost
      if (originalUnitCost === null && saleProduct.stockId) {
        try {
          const stock = await Stock.findById(saleProduct.stockId);
          if (stock) {
            originalUnitCost = stock.unitCost;
          }
        } catch (err) {
          console.error(`Failed to fetch stock for product ${saleProdIdStr}:`, err);
        }
      }
      
      // Final fallback to the input cost if everything else fails
      const finalUnitCost = originalUnitCost !== null ? originalUnitCost : inputProduct.unitCost;
      
      saleProductsToValidate.push({
        ...saleProduct.toObject(),
        unitCost: inputProduct.unitCost, // Use input cost as the return amount
        originalUnitCost: finalUnitCost, // Original purchase cost
        purchaseRef: saleProduct.purchaseRef, // Keep track of the original purchase reference
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

    // Update the sale document - mark specific products as returned or update noOfReturnProduct
    sale.products = sale.products.map(p => {
      const matched = matchedSaleProducts.find(mp => mp._id.toString() === p._id.toString());
      if (matched) {
        if (p.imeiNo) {
          // For IMEI products - mark as fully returned and update noOfReturnProduct
          return { 
            ...p.toObject(), 
            isReturn: true, 
            returnDate,
            noOfReturnProduct: p.quantity // Set to full quantity for IMEI products
          };
        } else {
          // For accessories - update noOfReturnProduct count
          const currentReturnedQty = p.noOfReturnProduct || 0;
          const newReturnedQty = currentReturnedQty + matched.quantity;
          
          // If all quantity returned, also mark isReturn as true
          const isFullyReturned = newReturnedQty >= p.quantity;
          
          return { 
            ...p.toObject(), 
            noOfReturnProduct: newReturnedQty,
            isReturn: isFullyReturned,
            returnDate: isFullyReturned ? returnDate : p.returnDate
          };
        }
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
        purchaseRef: p.purchaseRef, // Original purchase reference
        unitCost: p.unitCost, // Return amount sent from frontend
        originalUnitCost: p.originalUnitCost, // Original purchase cost
        color: p.color,
        storage: p.storage,
        imeiNo: p.imeiNo,
        serialNo: p.serialNo,
        quantity: p.quantity,
        lineTotal: p.unitCost * p.quantity, // Calculate lineTotal using frontend return amount
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
      unitCost: p.originalUnitCost, // Use original purchase price for stock creation
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
        unitCost: matchedSaleProducts[index].unitCost, // Frontend entered value
        originalUnitCost: matchedSaleProducts[index].originalUnitCost, // Original purchase cost
        lineTotal: matchedSaleProducts[index].unitCost * p.quantity, // Calculate line total using frontend value
        quantity: p.quantity,
        isReturn: false,
        gstApplicable: p.gstApplicable || false,
        gstPercentage: p.gstPercentage || 18,
        gstAmount: matchedSaleProducts[index]?.gstAmount || 0,
        lineTotalWithGst: matchedSaleProducts[index]?.lineTotalWithGst || (matchedSaleProducts[index].unitCost * p.quantity),
      })),
      total: totalReturnAmount,
      paymentDue: totalReturnAmount,
      status: 'received',
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