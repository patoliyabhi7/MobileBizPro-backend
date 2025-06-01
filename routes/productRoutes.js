const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addProduct } = require('../controllers/products/addProduct');
const { getAllProducts } = require('../controllers/products/getAllProducts');
const { getProductById } = require('../controllers/products/getProductById');
const { updateProduct } = require('../controllers/products/updateProduct');
const { deleteProduct } = require('../controllers/products/deleteProduct');
const { getAllProductsByBusinessLocation } = require('../controllers/products/getAllProductsByBusinessLocation');
const { getPurchasedProducts } = require('../controllers/products/getPurchasedProducts');

router.post('/', protect, authorizeRoles('admin'), addProduct);
router.get('/', protect, getAllProducts);
router.get('/purchased/:locationId', protect, getPurchasedProducts);
router.get('/location/:locationId', protect, getAllProductsByBusinessLocation);
router.get('/:id', protect, getProductById);
router.put('/:id', protect, authorizeRoles('admin'), updateProduct);
router.delete('/:id', protect, authorizeRoles('admin'), deleteProduct);

module.exports = router;
