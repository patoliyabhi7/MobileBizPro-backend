const Account = require('../../models/accountModel');

exports.getAllClosedAccount = async (req, res) => {
        try {
            const accounts = await Account.find({ is_active: false });
            res.status(200).json(accounts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };