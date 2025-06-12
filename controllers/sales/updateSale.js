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

    if (!Array.isArray(req.body.products) || req.body.products.length === 0) {
      return res.status(400).json({ error: 'At least one product required' });
    }

    const returnedProducts = (oldSale.products || []).filter(p => p.isReturn);
    if (returnedProducts.length > 0) {
      return res.status(400).json({ error: 'Cannot update sale with returned products. Please create a new sale.' });
    }

    const resolvedProducts = [];

    for (const p of req.body.products) {
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
