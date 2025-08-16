const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');
const Sale = require('../../models/saleModel');
const SaleReturn = require('../../models/saleReturnModel');
const Purchase = require('../../models/purchaseModel');
const Category = require('../../models/categoryModel');
const Brand = require('../../models/brandModel');

exports.getStockReport = async (req, res) => {
    try {
        const {
            brandId,
            categoryId,
            locationId
        } = req.query;

        const filter = { isDeleted: false };

        if (brandId && brandId.toLowerCase() !== 'all') filter.brand = brandId;
        if (categoryId && categoryId.toLowerCase() !== 'all') filter.category = categoryId;

        const products = await Product.find(filter)
            .populate('category', 'name')
            .populate('brand', 'name');

        const items = [];

        for (const product of products) {
            const stockFilter = {
                product: product._id,
                ...(locationId && locationId.toLowerCase() !== 'all' && { businessLocation: locationId })
            };

            const stocks = await Stock.find(stockFilter);

            let currentStock = 0;
            let stockValuePurchase = 0;

            for (const stock of stocks) {
                currentStock += stock.quantity;
                stockValuePurchase += stock.quantity * stock.unitCost;
            }

            const sellingPrice = product.sellingPrice || 0;
            const purchasePrice = product.purchasePrice || 0;

            // Get sales data for this product
            const saleFilter = {
                'products.product': product._id,
                isDeleted: false
            };

            if (locationId && locationId.toLowerCase() !== 'all') {
                saleFilter.businessLocation = locationId;
            }

            const sales = await Sale.find(saleFilter);

            // Calculate total units sold
            let totalUnitSold = 0;
            sales.forEach(sale => {
                sale.products.forEach(prod => {
                    if (prod.product.toString() === product._id.toString()) {
                        totalUnitSold += prod.quantity;
                    }
                });
            });

            const stockValueSale = currentStock * sellingPrice;
            const profit = stockValueSale - stockValuePurchase;

            items.push({
                sku: product.sku,
                product: product.productName,
                category: product.category?.name || '',
                brand: product.brand?.name || '',
                unitSellingPrice: sellingPrice,
                unitPurchasePrice: purchasePrice,
                currentStock,
                currentStockValuePurchase: stockValuePurchase,
                currentStockValueSale: stockValueSale,
                potentialProfit: profit,
                totalUnitSold,
                totalUnitAdjusted: 0
            });
        }

        const totals = items.reduce((acc, item) => {
            acc.currentStock += item.currentStock;
            acc.currentStockValuePurchase += item.currentStockValuePurchase;
            acc.currentStockValueSale += item.currentStockValueSale;
            acc.potentialProfit += item.potentialProfit;
            acc.totalUnitSold += item.totalUnitSold;
            acc.totalUnitAdjusted += item.totalUnitAdjusted;
            return acc;
        }, {
            currentStock: 0,
            currentStockValuePurchase: 0,
            currentStockValueSale: 0,
            potentialProfit: 0,
            totalUnitSold: 0,
            totalUnitAdjusted: 0
        });

        const profitMarginPercentage = totals.currentStockValuePurchase > 0
            ? ((totals.potentialProfit / totals.currentStockValuePurchase) * 100).toFixed(2)
            : "0.00";

        return res.status(200).json({
            summary: {
                closingStockPurchasePrice: totals.currentStockValuePurchase,
                closingStockSalePrice: totals.currentStockValueSale,
                potentialProfit: totals.potentialProfit,
                profitMarginPercentage
            },
            items,
            totals
        });
    } catch (error) {
        console.error('Error in getStockReport:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate stock report',
            error: error.message
        });
    }
};


module.exports = exports;
