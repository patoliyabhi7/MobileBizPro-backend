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

    const resolvedProducts = [];
    
    // First, add all returned products as-is
    returnedProducts.forEach(returnedProduct => {
      resolvedProducts.push(returnedProduct);
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

      if (p.imeiNo) {
        if (![0, 1].includes(requestedQuantity)) {
          return res.status(400).json({ error: `IMEI-based product quantity must be 0 or 1, got ${requestedQuantity}` });
        }
      } else {
        if (requestedQuantity < 0) {
          return res.status(400).json({ error: `Accessory quantity must be >= 0, got ${requestedQuantity}` });
        }
      }

      let match;

      if (p.imeiNo) {
        // Mobile match by IMEI
        match = (oldSale.products || []).find(old =>
          old.imeiNo === p.imeiNo &&
          !old.isReturn
        );
      } else {
        // Accessory match by product + color (if present)
        match = (oldSale.products || []).find(old =>
          old.product.toString() === p.product?.toString() &&
          !old.imeiNo && // must not be a mobile
          (!p.color || old.color === p.color) &&
          !old.isReturn
        );
      }

      console.log('match', match);

      if (requestedQuantity === 0) {
        resolvedProducts.push({
          ...p,
          quantity: 0,
          stockId: match?.stockId || null,
          isReturn: false,
        });
        continue;
      }

      if (match) {
        if (match.imeiNo) {
          if (requestedQuantity !== match.quantity) {
            return res.status(400).json({
              error: `Cannot change quantity for mobile with IMEI ${match.imeiNo}. Original quantity: ${match.quantity}`
            });
          }
        } else {
          if (requestedQuantity > match.quantity) {
            const additionalQty = requestedQuantity - match.quantity;
            const stock = await Stock.findById(match.stockId);
            if (!stock || stock.quantity < additionalQty) {
              return res.status(400).json({
                error: `Insufficient stock for accessory (Product: ${p.product}). Required: ${additionalQty}, Available: ${stock?.quantity || 0}`
              });
            }
          }
        }

        resolvedProducts.push({
          ...p,
          quantity: requestedQuantity,
          stockId: match.stockId,
          isReturn: false,
        });
      } else {
        const stockQuery = {
          product: p.product,
          businessLocation,
          quantity: { $gte: requestedQuantity }
        };

        if (p.imeiNo) {
          stockQuery.imeiNo = p.imeiNo;
          stockQuery.status = 1;
        }
        if (p.color) stockQuery.color = p.color;
        if (p.storage) stockQuery.storage = p.storage;

        const stock = await Stock.findOne(stockQuery);

        if (!stock) {
          const productType = p.imeiNo ? 'mobile' : 'accessory';
          const identifier = p.imeiNo ? `IMEI: ${p.imeiNo}` : `Product: ${p.product}`;
          return res.status(404).json({
            error: `Insufficient stock for ${productType} (${identifier}). Required: ${requestedQuantity}, Available: ${stock?.quantity || 0}`
          });
        }

        resolvedProducts.push({
          ...p,
          quantity: requestedQuantity,
          stockId: stock._id,
          isReturn: false,
        });
      }
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

    for (const oldProduct of (oldSale.products || [])) {
      if (!oldProduct.stockId || oldProduct.quantity <= 0 || oldProduct.isReturn) continue;

      const newProduct = resolvedProducts.find(p => p.stockId?.toString() === oldProduct.stockId.toString());

      if (!newProduct) {
        stockChanges.push({ type: 'revert', product: oldProduct });
      } else if (!oldProduct.imeiNo && newProduct.quantity !== oldProduct.quantity) {
        const diff = newProduct.quantity - oldProduct.quantity;
        if (diff > 0) {
          stockChanges.push({ type: 'consume', product: { ...newProduct, quantity: diff } });
        } else if (diff < 0) {
          stockChanges.push({ type: 'revert', product: { ...newProduct, quantity: Math.abs(diff) } });
        }
      }
    }

    for (const newProduct of resolvedProducts) {
      const isExisting = (oldSale.products || []).some(p => p.stockId?.toString() === newProduct.stockId?.toString());
      if (!isExisting && newProduct.quantity > 0) {
        stockChanges.push({ type: 'consume', product: newProduct });
      }
    }

    for (const change of stockChanges) {
      if (change.type === 'revert') {
        await revertStock([change.product]);
      } else if (change.type === 'consume') {
        await consumeStock([change.product]);
      }
    }

    if (oldPaymentsClone.length > 0) {
      await revertAccountBalances(oldPaymentsClone, 'sale');
    }

    req.body.products = resolvedProducts;

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

    if (newPayments.length > 0) {
      await updateAccountBalances(newPayments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', sale: updatedSale });
  } catch (err) {
    console.error('Update sale failed:', err);
    res.status(500).json({ error: err.message });
  }
};
