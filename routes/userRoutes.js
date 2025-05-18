const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.js');

const { registerUser } = require('../controllers/user/register');
const { loginUser } = require('../controllers/user/login');
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');
const { editProfile } = require('../controllers/user/editProfile');
const { changePassword } = require('../controllers/user/changePassword');

// Public routes
router.post('/register', upload.single('profilePhoto'), registerUser);
router.post('/login', loginUser);
router.put('/change-password', protect, changePassword);
router.put('/edit-profile', protect, upload.single('profilePhoto'), editProfile);

module.exports = router;
