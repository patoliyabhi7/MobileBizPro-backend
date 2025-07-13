const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
require('dotenv').config();
const { warmupInvoiceSystem, cleanupInvoiceSystem } = require('./controllers/invoice/generateInvoice');

const app = express();
connectDB();
//require('./cron/recurringExpenseJob');
require('./cron/backupAndEmail');

// Middlewares
app.use(cors({
    origin: ['https://portal.mobixmobile.in', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

const brandRoutes = require('./routes/brandRoutes');
app.use('/api/brands', brandRoutes);

const categoryRoutes = require('./routes/categoryRoutes');
app.use('/api/categories', categoryRoutes);

const businessLocationRoutes = require('./routes/businessLocationRoutes');
app.use('/api/business-locations', businessLocationRoutes);

const productRoutes = require('./routes/productRoutes');
app.use('/api/products', productRoutes);

const supplierRoutes = require('./routes/supplierRoutes');
app.use('/api/suppliers', supplierRoutes);

const customerRoutes = require('./routes/customerRoutes');
app.use('/api/customers', customerRoutes);

const contactRoutes = require('./routes/contactRoutes');
app.use('/api/contacts', contactRoutes);

const purchaseRoutes = require('./routes/purchaseRoutes');
app.use('/api/purchases', purchaseRoutes);

const saleRoutes = require('./routes/saleRoutes');
app.use('/api/sales', saleRoutes);

const expenseRoutes = require('./routes/expenseRoutes');
app.use('/api/expenses', expenseRoutes);

const expenseCategoriesRoutes = require('./routes/expenseCategoriesRoutes');
app.use('/api/expense-categories', expenseCategoriesRoutes);

const accountTypeRoutes = require('./routes/accountTypeRoutes');
app.use('/api/account-types', accountTypeRoutes);

const accountRoutes = require('./routes/accountRoutes');
app.use('/api/accounts', accountRoutes);

const invoiceRoutes = require('./routes/invoiceRoutes');
app.use('/api/invoices', invoiceRoutes);

const reportRoutes = require('./routes/reportRoutes');
app.use('/api/reports', reportRoutes);

module.exports = app;
