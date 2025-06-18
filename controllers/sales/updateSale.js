const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');
const path = require('path');
const fs = require('fs');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const revertStock = require('../../utils/revertStock');
const consumeStock = require('../../utils/consumeStock');
const Stock = require('../../models/stockModel');

exports.updateSale = async (req, res) => {
  try {
    const saleId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      return res.status(400).json({ error: 'Invalid sale ID format' });
    }

    const oldSale = await Sale.findById(saleId).lean();
    if (!oldSale || oldSale.isDeleted) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const businessLocation = req.body.businessLocation || oldSale.businessLocation?.toString();
    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    // Check if user is only updating payments or other non-product fields
    const isUpdatingProducts = 'products' in req.body;
    const isUpdatingOnlyPayments = !isUpdatingProducts && 'payments' in req.body;
    
    // Find returned products in the original sale
    const returnedProducts = (oldSale.products || []).filter(p => p.isReturn);
    
    // If only updating payments, skip product validation and use existing products
    if (isUpdatingOnlyPayments) {
      // Process payments
      let newPayments = [];
      if (typeof req.body.payments === 'string') {
        try {
          newPayments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        newPayments = req.body.payments;
      }

      const newRefNo = await generateAutoId('SALEPYMNT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo,
        amount: Number(p.amount || 0)
      }));

      // Revert old payments
      await revertAccountBalances(oldSale.payments || [], 'sale');
      
      // Update sale with new payments only, preserve existing products
      const updateData = {
        payments: newPayments,
        addedBy: req.user.userId
      };
      
      // Add any other non-product fields being updated
      for (const key in req.body) {
        if (key !== 'products' && key !== 'payments') {
          updateData[key] = req.body[key];
        }
      }
      
      const updatedSale = await Sale.findByIdAndUpdate(saleId, updateData, { new: true })
        .populate('customer')
        .populate('businessLocation')
        .populate('addedBy', 'name _id')
        .populate('products.product')
        .populate('payments.account')
        .populate('payments.method');

      // Update account balances with new payments
      if (newPayments.length > 0) {
        await updateAccountBalances(newPayments, 'sale');
      }

      return res.status(200).json({ 
        message: 'Sale payments updated successfully', 
        sale: updatedSale 
      });
    }
    
    // If updating products, validate required products
    if (!Array.isArray(req.body.products) || req.body.products.length === 0) {
      return res.status(400).json({ error: 'At least one product required' });
    }
    
    // Check if any returned products have been modified or removed
    if (returnedProducts.length > 0) {
      for (const returnedProduct of returnedProducts) {
        // Try to find the same product in the updated products list
        const matchingUpdatedProduct = req.body.products.find(p => {
          // For mobile phones (with IMEI), match by product and IMEI
          if (returnedProduct.imeiNo) {
            return p.product?.toString() === returnedProduct.product.toString() && 
                   p.imeiNo === returnedProduct.imeiNo;
          } 
          // For accessories (without IMEI), match by product and color
          else {
            return p.product?.toString() === returnedProduct.product.toString() && 
                   p.color === returnedProduct.color;
          }
        });
        
        // If returned product is missing, throw error
        if (!matchingUpdatedProduct) {
          return res.status(400).json({
            error: 'Cannot remove returned products.'
          });
        }
        
        // Check if important properties were modified
        if (
          matchingUpdatedProduct.quantity !== returnedProduct.quantity ||
          matchingUpdatedProduct.unitPrice !== returnedProduct.unitPrice
        ) {
          return res.status(400).json({
            error: 'Cannot modify details of returned products.'
          });
        }
      }
    }

    const validatedProducts = [];
    
    // First, add all returned products as-is
    returnedProducts.forEach(returnedProduct => {
      validatedProducts.push(returnedProduct);
    });

    // Then process the non-returned products
    for (const p of req.body.products) {
      // Skip returned products (already added)
      const isReturnedProduct = returnedProducts.some(rp => {
        // For mobile phones (with IMEI)
        if (rp.imeiNo) {
          return rp.product.toString() === p.product?.toString() && rp.imeiNo === p.imeiNo;
        } 
        // For accessories (without IMEI)
        else {
          return rp.product.toString() === p.product?.toString() && rp.color === p.color;
        }
      });
      if (isReturnedProduct) continue;

      const requestedQuantity = p.quantity || 1;

      // Skip validation for zero quantity products
      if (requestedQuantity === 0) {
        validatedProducts.push({
          ...p,
          quantity: 0,
          isReturn: false,
        });
        continue;
      }

      // Verify stockId is provided
      if (!p.stockId) {
        return res.status(400).json({
          error: `stockId is required for product ${p.product}`
        });
      }

      // Validate the stock exists
      const stock = await Stock.findById(p.stockId);
      if (!stock) {
        return res.status(404).json({
          error: `Stock not found with ID: ${p.stockId}`
        });
      }

      // Check if this was an existing product in the sale
      const existingProduct = (oldSale.products || []).find(old => 
        old.stockId?.toString() === p.stockId.toString() && !old.isReturn
      );

      if (stock.imeiNo) {
        // IMEI product validation
        if (requestedQuantity !== 1) {
          return res.status(400).json({
            error: `IMEI-based product quantity must be 1, got ${requestedQuantity}`
          });
        }
        
        // If this is a new product (not in original sale), check if it's available
        if (!existingProduct && stock.status !== 1) {
          return res.status(400).json({
            error: `Stock with IMEI ${stock.imeiNo} is not available for sale (status: ${stock.status})`
          });
        }
      } else {
        // For accessories, if quantity increased, check available stock
        if (existingProduct) {
          if (requestedQuantity > existingProduct.quantity) {
            const additionalQty = requestedQuantity - existingProduct.quantity;
            if (stock.quantity < additionalQty) {
              return res.status(400).json({
                error: `Insufficient stock for accessory (Product: ${p.product}). Required: ${additionalQty}, Available: ${stock.quantity}`
              });
            }
          }
        } else {
          // New accessory, check full quantity
          if (stock.quantity < requestedQuantity) {
            return res.status(400).json({
              error: `Insufficient stock for accessory (Product: ${p.product}). Required: ${requestedQuantity}, Available: ${stock.quantity}`
            });
          }
        }
      }

      validatedProducts.push({
        ...p,
        quantity: requestedQuantity,
        isReturn: false,
      });
    }

    if (req.files?.length > 0 && Array.isArray(oldSale.documents)) {
      for (const docPath of oldSale.documents) {
        try {
          if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
        } catch (e) {
          console.warn(`Failed to delete file ${docPath}`, e);
        }
      }
      req.body.documents = req.files.map(file => path.join('uploads', file.filename));
    }

    let newPayments = [];
    if ('payments' in req.body) {
      if (typeof req.body.payments === 'string') {
        try {
          newPayments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        newPayments = req.body.payments;
      }

      const newRefNo = await generateAutoId('SALEPYMNT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo,
        amount: Number(p.amount || 0)
      }));

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId;
    const oldPaymentsClone = JSON.parse(JSON.stringify(oldSale.payments || []));

    const stockChanges = [];

    // Process stock changes for existing products
    for (const oldProduct of (oldSale.products || [])) {
      if (!oldProduct.stockId || oldProduct.quantity <= 0 || oldProduct.isReturn) continue;

      // Find this product in the new products list
      const newProduct = validatedProducts.find(p => p.stockId?.toString() === oldProduct.stockId.toString());

      if (!newProduct) {
        // Product was removed - revert the stock
        stockChanges.push({ type: 'revert', product: oldProduct });
      } else if (!oldProduct.imeiNo && newProduct.quantity !== oldProduct.quantity) {
        // Quantity changed for an accessory
        const diff = newProduct.quantity - oldProduct.quantity;
        if (diff > 0) {
          // Increased quantity - consume more stock
          stockChanges.push({ type: 'consume', product: { ...newProduct, quantity: diff } });
        } else if (diff < 0) {
          // Decreased quantity - revert some stock
          stockChanges.push({ type: 'revert', product: { ...newProduct, quantity: Math.abs(diff) } });
        }
      }
    }

    // Process stock changes for new products
    for (const newProduct of validatedProducts) {
      if (!newProduct.stockId || newProduct.quantity <= 0 || newProduct.isReturn) continue;
      
      const isExisting = (oldSale.products || []).some(p => p.stockId?.toString() === newProduct.stockId?.toString());
      if (!isExisting) {
        // New product added - consume stock
        stockChanges.push({ type: 'consume', product: newProduct });
      }
    }

    // Apply all stock changes
    for (const change of stockChanges) {
      if (change.type === 'revert') {
        await revertStock([change.product]);
      } else if (change.type === 'consume') {
        await consumeStock([change.product]);
      }
    }

    // Revert old payments
    if (oldPaymentsClone.length > 0) {
      await revertAccountBalances(oldPaymentsClone, 'sale');
    }

    // Update the sale with validated products
    req.body.products = validatedProducts;

    const updatedSale = await Sale.findByIdAndUpdate(saleId, req.body, { new: true })
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    if (!updatedSale) {
      return res.status(404).json({ message: 'Sale not found after update' });
    }

    // Apply new payments
    if (newPayments.length > 0) {
      await updateAccountBalances(newPayments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', sale: updatedSale });
  } catch (err) {
    console.error('Update sale failed:', err);
    res.status(500).json({ error: err.message });
  }
};
