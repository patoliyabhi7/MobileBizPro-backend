const AccountType = require('../../models/accountTypeModel');

exports.getAllAccountTypes = async (req, res) => {
    try {
        const accountTypes = await AccountType.find({ isDeleted: false });
        res.status(200).json(accountTypes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};