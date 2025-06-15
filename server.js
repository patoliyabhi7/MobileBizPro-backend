const app = require('./app');
const { warmupInvoiceSystem, cleanupInvoiceSystem } = require('./controllers/invoice/generateInvoice');

const PORT = process.env.PORT || 4001;

app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);

  await warmupInvoiceSystem();
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await cleanupInvoiceSystem();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await cleanupInvoiceSystem();
  process.exit(0);
});
