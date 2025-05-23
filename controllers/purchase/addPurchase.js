const Purchase = require('../../models/purchaseModel');
const Counter = require('../../models/counterModel');

exports.addPurchase = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `PUR${currentYear}`;

    // Find and update counter
    const counter = await Counter.findOneAndUpdate(
      { prefix },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    // Format: PUR2025/0001
    const formattedSeq = String(counter.seq).padStart(4, '0');
    const referenceNo = `${prefix}/${formattedSeq}`;
    req.body.addedBy = req.user.userId;

    const purchase = new Purchase({
      ...req.body,
      referenceNo
    });

    await purchase.save();
    const populatedPurchase = await Purchase.findById(purchase._id).populate('linkedAccount').populate('addedBy', 'name _id');
    res.status(201).json({ message: 'Purchase added successfully', populatedPurchase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
