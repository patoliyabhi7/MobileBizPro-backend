const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');
const revertStock = require('../../utils/revertStock');
const createStock = require('../../utils/createStock');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const Stock = require('../../models/stockModel');
const fs = require('fs');

exports.updatePurchase = async (req, res) => {
  try {
    const oldPurchase = await Purchase.findById(req.params.id);
    if (!oldPurchase || oldPurchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or deleted' });
    }

    // If purchase is created from sale return return, restrict product updates
    if (oldPurchase.createdFromReturn) {
      if ('products' in req.body) {
        return res.status(400).json({
          error: 'Cannot update products of a sale return purchase. Only payments and documents can be updated.'
        });
      }

      // Handle documents update (delete old, add new)
      if (req.files?.length > 0) {
        if (oldPurchase.documents?.length > 0) {
          oldPurchase.documents.forEach(doc => {
            if (fs.existsSync(doc)) fs.unlinkSync(doc);
          });
        }
        req.body.documents = req.files.map(file => `uploads/${file.filename}`);
      }

      // Handle payments update
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

        const newRefNo = await generateAutoId('PURPYMNT');
        newPayments = newPayments.map(p => ({
          ...p,
          paidOn: new Date(p.paidOn),
          paymentRefNo: newRefNo
        }));

        req.body.payments = newPayments;

        await revertAccountBalances(oldPurchase.payments || [], 'purchase');
        await updateAccountBalances(newPayments, 'purchase');
      }

      req.body.addedBy = req.user.userId;

      const updatedPurchase = await Purchase.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      )
        .populate('addedBy', 'name _id')
        .populate('payments.account')
        .populate('payments.method')
        .populate('supplier', 'businessName firstName lastName')
        .populate('businessLocation', 'name')
        .populate('products.product', 'productName');

      return res.status(200).json({
        message: 'Sale return purchase payment updated successfully',
        updatedPurchase
      });
    }

    // Parse updated products array from request
    let updatedProducts = [];
    if (req.body.products) {
      updatedProducts = typeof req.body.products === 'string'
        ? JSON.parse(req.body.products)
        : req.body.products;

      // Validate updated products
      for (const item of updatedProducts) {
        if (!item.product) {
          return res.status(400).json({ error: 'Missing product reference in one of the stock items' });
        }

        // Ensure originalUnitCost is set for new products
        if (!item.originalUnitCost && item.unitCost) {
          item.originalUnitCost = item.unitCost;
        }

        // For IMEI items (mobiles), quantity must be 1
        if (item.imeiNo && item.quantity !== 1) {
          return res.status(400).json({
            error: `IMEI-based item must have quantity = 1, got ${item.quantity}`
          });
        }

        // For accessories (no IMEI), quantity must be >= 0
        if (!item.imeiNo && (item.quantity == null || item.quantity < 0)) {
          return res.status(400).json({
            error: `Accessories must have a quantity >= 0`
          });
        }

        // Verify stockId is provided for existing products
        // New products won't have stockId, they will be created later
        if (!item.stockId && item.existingProduct) {
          return res.status(400).json({
            error: `stockId is required for existing product ${item.product}`
          });
        }
      }
    }

    // Check stock status for restrictions
    const stockIds = oldPurchase.products?.map(p => p.stockId).filter(Boolean) || [];
    const stocks = await Stock.find({ _id: { $in: stockIds } });

    const returnedProducts = oldPurchase.products?.filter(p => p.isReturn) || [];
    const returnedStockIds = returnedProducts.map(p => String(p.stockId));
    const updatedStockIds = updatedProducts.filter(p => p.stockId).map(p => String(p.stockId));

    // Check for sold/returned products and apply restrictions
    for (const product of oldPurchase.products || []) {
      const stock = stocks.find(s => String(s._id) === String(product.stockId));

      // If product is returned, prevent removal
      if (product.isReturn && !updatedStockIds.includes(String(product.stockId))) {
        return res.status(400).json({
          error: `Cannot remove returned product with stock ID: ${product.stockId}`
        });
      }

      // If stock is mobile and sold (status = 0), prevent removal/modification
      if (stock?.imeiNo && stock.status === 0) {
        if (!updatedStockIds.includes(String(product.stockId))) {
          return res.status(400).json({
            error: `Cannot remove sold mobile with stock ID: ${product.stockId}`
          });
        }
      }

      // If stock is accessory and completely sold (quantity = 0), prevent removal
      if (!stock?.imeiNo && stock?.quantity === 0) {
        if (!updatedStockIds.includes(String(product.stockId))) {
          return res.status(400).json({
            error: `Cannot remove completely sold accessory with stock ID: ${product.stockId}`
          });
        }
      }
    }

    // Prevent modifying details of returned products
    const triedToModifyReturned = updatedProducts.some(p => {
      return returnedStockIds.includes(String(p.stockId)) &&
        !returnedProducts.some(rp =>
          String(rp.stockId) === String(p.stockId) &&
          rp.product.toString() === p.product &&
          rp.color === p.color &&
          rp.storage === p.storage &&
          rp.lineTotal === p.lineTotal
        );
    });

    if (triedToModifyReturned) {
      return res.status(400).json({ error: 'Cannot modify details of returned products' });
    }

    // Revert stock for removed products (that are not sold/returned)
    const removedProducts = oldPurchase.products?.filter(p => {
      const stock = stocks.find(s => String(s._id) === String(p.stockId));
      const isNotInUpdated = !updatedStockIds.includes(String(p.stockId));
      const isNotReturned = !p.isReturn;
      const isNotSold = stock ? (stock.imeiNo ? stock.status !== 0 : stock.quantity > 0) : false;

      return isNotInUpdated && isNotReturned && isNotSold;
    }) || [];

    if (removedProducts.length > 0) {
      await revertStock(removedProducts);
    }

    // Handle document uploads and delete old files if any
    if (req.files?.length > 0) {
      if (oldPurchase.documents?.length > 0) {
        oldPurchase.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }
      req.body.documents = req.files.map(file => `uploads/${file.filename}`);
    }

    // Handle payments parsing and assign paymentRefNo
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

      const newRefNo = await generateAutoId('PURPYMNT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo
      }));

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId;

    // Revert old payments in account balances
    await revertAccountBalances(oldPurchase.payments || [], 'purchase');

    // Create stock for any new products added (products without stockId)
    const newProducts = updatedProducts.filter(p => !p.stockId);

    if (newProducts.length > 0) {
      const productsWithStockIds = await createStock(
        newProducts,
        oldPurchase._id,
        oldPurchase.businessLocation
      );

      // Update the updatedProducts with the new stockIds
      productsWithStockIds.forEach(newProduct => {
        const index = updatedProducts.findIndex(p =>
          p.product === newProduct.product &&
          p.color === newProduct.color &&
          p.storage === newProduct.storage &&
          !p.stockId
        );
        if (index !== -1) {
          updatedProducts[index] = newProduct;
        }
      });
    }

    // Update existing stock quantities for modified products (only for accessories not returned/sold)
    for (const updatedProduct of updatedProducts) {
      if (updatedProduct.stockId) {
        const oldProduct = oldPurchase.products.find(p => String(p.stockId) === String(updatedProduct.stockId));
        const stock = stocks.find(s => String(s._id) === String(updatedProduct.stockId));

        if (oldProduct && stock && !oldProduct.isReturn) {
          // Create a common update object for all stock updates
          const stockUpdateData = {
            color: updatedProduct.color,
            gstApplicable: updatedProduct.gstApplicable,
            gstPercentage: updatedProduct.gstPercentage,
            unitCost: updatedProduct.unitCost,
            originalUnitCost: updatedProduct.unitCost,
            serialNo: updatedProduct.serialNo,
            storage: updatedProduct.storage
          };

          // Only update quantities for accessories, and maintain sold units calculation
          if (!stock.imeiNo && stock.quantity > 0 && oldProduct.quantity !== updatedProduct.quantity) {
            // Calculate sold units (difference between initialQuantity and quantity)
            const soldUnits = stock.initialQuantity - stock.quantity;
            
            // Update initialQuantity and quantity in the update object
            stockUpdateData.initialQuantity = updatedProduct.quantity;
            stockUpdateData.quantity = Math.max(0, updatedProduct.quantity - soldUnits);
          }
          
          // Always update the stock record, regardless of whether quantity or price changed
          await Stock.findByIdAndUpdate(updatedProduct.stockId, stockUpdateData);
        }
      }
    }

    // Final products list = returned + sold + updated (excluding those already returned/sold)
    const finalProducts = [
      ...returnedProducts,
      ...oldPurchase.products.filter(p => {
        const stock = stocks.find(s => String(s._id) === String(p.stockId));
        return !p.isReturn && stock?.imeiNo && stock.status === 0; // Sold mobiles
      }),
      ...oldPurchase.products.filter(p => {
        const stock = stocks.find(s => String(s._id) === String(p.stockId));
        return !p.isReturn && !stock?.imeiNo && stock?.quantity === 0; // Completely sold accessories
      }),
      ...updatedProducts.filter(p =>
        !returnedProducts.some(rp => String(rp.stockId) === String(p.stockId)) &&
        !oldPurchase.products.some(op => {
          const stock = stocks.find(s => String(s._id) === String(op.stockId));
          return String(op.stockId) === String(p.stockId) && (
            (stock?.imeiNo && stock.status === 0) || // Sold mobile
            (!stock?.imeiNo && stock?.quantity === 0) // Completely sold accessory
          );
        })
      )
    ];

    req.body.products = finalProducts;

    // Update purchase doc
    const updatedPurchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
      .populate('addedBy', 'name _id')
      .populate('payments.account')
      .populate('payments.method')
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('products.product', 'productName');

    if (!updatedPurchase) {
      return res.status(404).json({ message: 'Purchase not found after update' });
    }

    // Update account balances with new payments
    if (updatedPurchase.payments?.length > 0) {
      await updateAccountBalances(updatedPurchase.payments, 'purchase');
    }

    res.status(200).json({
      message: 'Purchase updated successfully',
      updatedPurchase
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};