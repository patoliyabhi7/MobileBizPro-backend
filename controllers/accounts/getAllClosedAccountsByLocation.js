const mongoose = require('mongoose');
const Account = require('../../models/accountModel');

exports.getAllClosedAccountsByLocation = async (req, res) => {
    try {
        const rawLocationId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
            return res.status(400).json({ error: 'Invalid Location ID format' });
        }

        const locationId = new mongoose.Types.ObjectId(rawLocationId);
        const accounts = await Account.find({ businessLocation: locationId, is_active: false })
            .populate('addedBy', 'name _id')
            .populate('account_type')
            .populate('businessLocation');

        res.status(200).json(accounts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
