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

    const purchase = new Purchase({
      ...req.body,
      referenceNo,
    });

    await purchase.save();
    res.status(201).json({ message: 'Purchase added successfully', purchase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
