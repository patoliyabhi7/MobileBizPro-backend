const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorizeRoles } = require('../middlewares/role');

const { addBusinessLocation } = require('../controllers/businessLocation/addBusinessLocation');
const { getAllBusinessLocations } = require('../controllers/businessLocation/getAllBusinessLocations');
const { getBusinessLocationById } = require('../controllers/businessLocation/getBusinessLocationById');
const { updateBusinessLocation } = require('../controllers/businessLocation/updateBusinessLocation');
const { deleteBusinessLocation } = require('../controllers/businessLocation/deleteBusinessLocation');

router.post('/', protect, authorizeRoles('admin'), addBusinessLocation);
router.get('/', protect, getAllBusinessLocations);
router.get('/:id', protect, getBusinessLocationById);
router.put('/:id', protect, authorizeRoles('admin'), updateBusinessLocation);
router.delete('/:id', protect, authorizeRoles('admin'), deleteBusinessLocation);

module.exports = router;
