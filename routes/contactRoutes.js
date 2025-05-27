const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadExcel');
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { importContacts } = require('../controllers/contacts/importContacts');
const { getAllContacts } = require('../controllers/contacts/getAllContacts');

router.post('/import/upload', upload.single('file'), importContacts);
router.get('/', protect, authorizeRoles('admin'), getAllContacts);

module.exports = router;
