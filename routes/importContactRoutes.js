const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadExcel');
const { importContacts } = require('../controllers/contacts/importContacts');

router.post('/upload', upload.single('file'), importContacts);

module.exports = router;
