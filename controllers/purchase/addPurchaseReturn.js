const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const generateAutoId = require('../../utils/generateAutoId');
const consumeStock = require('../../utils/consumeStock');

exports.addPurchaseReturn = async (req, res) => {
  try {
    const { oldPurchaseId } = req.params;
    const { businessLocation, products = [], totalReturnAmount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(oldPurchaseId)) {
      return res.status(400).json({ error: 'Invalid Purchase ID format' });
    }

    if (!businessLocation || products.length === 0) {
      return res.status(400).json({ error: 'Business location and products are required' });
    }

    const purchase = await Purchase.findById(oldPurchaseId);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Original purchase not found' });
    }

    if (purchase.businessLocation.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Purchase does not belong to the given business location' });
    }

    const returnedProducts = [];

    for (let item of products) {
      const { productId, unitCost } = item;
    
      const matchedProduct = purchase.products.find(
        p =>
          p.product.toString() === productId &&
          !p.isReturn // ✅ We only allow not-yet-returned items
      );
    
      if (!matchedProduct) {
        return res.status(400).json({
          error: `Product with ID ${productId} not found or already returned.`
        });
      }
    
      if (matchedProduct.isSold) {
        return res.status(400).json({
          error: `Product with ID ${productId} is already sold and cannot be returned.`
        });
      }
    
      matchedProduct.isReturn = true;
      matchedProduct.returnDate = new Date();
    
      returnedProducts.push({
        product: matchedProduct.product,
        imeiNo: matchedProduct.imeiNo,
        color: matchedProduct.color,
        storage: matchedProduct.storage,
        unitCost: unitCost,
        lineTotal: unitCost,
        quantity: 1,
        gstApplicable: matchedProduct.gstApplicable || false,
        gstPercentage: matchedProduct.gstPercentage || 18,
        gstAmount: matchedProduct.gstAmount || 0,
        lineTotalWithGst: matchedProduct.lineTotalWithGst || 0,
        serialNo: matchedProduct.serialNo,
        note: ''
      });
    }    

    await purchase.save();

    await consumeStock(
      purchase.products
        .filter(p => p.isReturn && p.stockId)
        .map(p => ({ stockId: p.stockId }))
    );

    const returnDoc = await PurchaseReturn.create({
      originalPurchase: purchase._id,
      businessLocation,
      referenceNo: await generateAutoId('PURRET'),
      returnedProducts,
      totalReturnAmount,
      paymentStatus: 'due',
      paymentDue: totalReturnAmount,
      returnPayments: [],
      returnDate: new Date(),
      addedBy: req.user?._id
    });

    res.status(200).json({
      message: 'Purchase return recorded successfully',
      purchaseReturn: returnDoc
    });
  } catch (err) {
    console.error('Add Purchase Return Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
