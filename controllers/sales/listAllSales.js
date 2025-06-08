const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');

exports.listAllSales = async (req, res) => {
  try {
    const sales = await Sale.find({
      isDeleted: false,
      $expr: {
        $gt: [
          {
            $size: {
              $filter: {
                input: '$products',
                as: 'product',
                cond: { $eq: ['$$product.isReturn', false] }
              }
            }
          },
          0
        ]
      }
    })
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    // Filter products on each sale to include only non-returned products
    const filteredSales = sales.map(sale => {
      const saleObj = sale.toObject();
      saleObj.products = saleObj.products.filter(p => p.isReturn === false);
      return saleObj;
    });

    res.status(200).json(filteredSales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
