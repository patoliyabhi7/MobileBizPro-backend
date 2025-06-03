const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const consumeStock = require('../../utils/consumeStock');
const Purchase = require('../../models/purchaseModel');
const Stock = require('../../models/stockModel');

exports.addSale = async (req, res) => {
  try {
    const invoiceNo = req.body.invoiceNo || await generateAutoId('INV');
    req.body.addedBy = req.user.userId;

    const businessLocation = req.body.businessLocation;
    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    // 🧾 Parse payments
    let payments = [];
    if (req.body.payments) {
      if (typeof req.body.payments === 'string') {
        try {
          payments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        payments = req.body.payments;
      }

      const paymentRefNo = await generateAutoId('SALEPYMNT');
      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo,
      }));
    }

    // 📎 Handle file uploads
    const filePaths = req.files?.map(file => path.join('uploads', file.filename)) || [];

    const saleData = {
      ...req.body,
      invoiceNo,
      documents: filePaths,
      payments
    };

    const sale = new Sale(saleData);
    await sale.save();

    // 💰 Update account balances
    if (payments.length > 0) {
      await updateAccountBalances(payments, 'sale');
    }

    // 📦 Consume stock (mark IMEI items as used)
    await consumeStock(req.body.products);

    const imeiNos = req.body.products.map(p => p.imeiNo).filter(Boolean);

    if (imeiNos.length > 0) {
      const stocks = await Stock.find({ imeiNo: { $in: imeiNos } }).select('purchaseRef imeiNo');

      for (const stock of stocks) {
        const purchaseId = stock.purchaseRef;
        const imeiNo = stock.imeiNo;

        await Purchase.updateOne(
          { _id: purchaseId, 'products.imeiNo': imeiNo },
          { $set: { 'products.$.isSold': true } }
        );
      }

    }

    const populatedSale = await Sale.findById(sale._id)
      .populate('payments.account')
      .populate('addedBy', 'name _id')
      .populate('customer')
      .populate('businessLocation')
      .populate('products.product')
      .populate('payments.method');

    res.status(201).json({ message: 'Sale added successfully', populatedSale });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
