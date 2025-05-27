const Contact = require('../../models/contactModel');

exports.getAllContacts = async (req, res) => {
    try {
        const contacts = await Contact.find({ isDeleted: false });
        res.status(200).json(contacts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};