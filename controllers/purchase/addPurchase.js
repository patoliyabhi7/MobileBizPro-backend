const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.addPurchase = async (req, res) => {
  try {
    const referenceNo = req.body.referenceNo || await generateAutoId('PUR');
    req.body.addedBy = req.user.userId;
    const filePaths = req.files?.map(file => `uploads/${file.filename}`) || [];
    const purchase = new Purchase({
      ...req.body,
      referenceNo,
      documents: filePaths
    });

    await purchase.save();
    const populatedPurchase = await Purchase.findById(purchase._id).populate('linkedAccount').populate('addedBy', 'name _id');
    res.status(201).json({ message: 'Purchase added successfully', populatedPurchase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
