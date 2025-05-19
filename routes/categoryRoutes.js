const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addCategory } = require('../controllers/categories/addCategory');
const { getAllCategories } = require('../controllers/categories/getAllCategories');
const { getCategoryById } = require('../controllers/categories/getCategoryById');
const { updateCategory } = require('../controllers/categories/updateCategory');
const { deleteCategory } = require('../controllers/categories/deleteCategory');

router.post('/', protect, authorizeRoles('admin'), addCategory);
router.get('/', protect, getAllCategories);
router.get('/:id', protect, getCategoryById);
router.put('/:id', protect, authorizeRoles('admin'), updateCategory);
router.delete('/:id', protect, authorizeRoles('admin'), deleteCategory);

module.exports = router;
