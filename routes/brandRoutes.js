const express = require('express');
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');
const router = express.Router();

const { addBrand } = require('../controllers/brands/addBrand');
const { getAllBrands } = require('../controllers/brands/getAllBrands');
const { getBrandById } = require('../controllers/brands/getBrandById');
const { updateBrand } = require('../controllers/brands/updateBrand');
const { deleteBrand } = require('../controllers/brands/deleteBrand');

// Example: /api/brands
router.post('/', protect, authorizeRoles('admin'), addBrand);
router.get('/', protect, getAllBrands);
router.get('/:id', protect, getBrandById);
router.put('/:id', protect, authorizeRoles('admin'), updateBrand);
router.delete('/:id', protect, authorizeRoles('admin'), deleteBrand);

module.exports = router;
