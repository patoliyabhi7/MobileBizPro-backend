const mongoose = require('mongoose');
const Expense = require('../../models/expenseModel');

exports.getAllExpensesByBusinessLocation = async (req, res) => {
    try {
        const rawLocationId = req.params.locationId;

        if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
            return res.status(400).json({ error: 'Invalid Location ID format' });
        }

        const locationId = new mongoose.Types.ObjectId(rawLocationId);

        const expenses = await Expense.find({
            businessLocation: locationId,
            isDeleted: false
        })
        .populate('category').populate('businessLocation').populate('expenseFor').populate('expenseForContact').populate('payments.account').populate('addedBy', 'name _id');

        res.status(200).json({ expenses });
    } catch (err) {
        console.error('Error fetching expenses:', err);
        res.status(500).json({ error: err.message });
    }
};

