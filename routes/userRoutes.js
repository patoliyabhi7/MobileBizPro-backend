const express = require('express');
const router = express.Router();
const { uploadSingle } = require('../middlewares/upload.js');

const { registerUser } = require('../controllers/user/register');
const { loginUser } = require('../controllers/user/login');
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');
const { editProfile } = require('../controllers/user/editProfile');
const { changePassword } = require('../controllers/user/changePassword');
const { getAllUsers } = require('../controllers/user/getAllUsers');

// Public routes
router.get('/all-users', protect, getAllUsers);
router.post('/register', uploadSingle('profilePhoto'), registerUser);
router.post('/login', loginUser);
router.put('/change-password', protect, changePassword);
router.put('/edit-profile', protect, uploadSingle('profilePhoto'), editProfile);

module.exports = router;
