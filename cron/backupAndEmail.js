const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const archiver = require('archiver');
const nodemailer = require('nodemailer');

// Setup
const mongoUri = process.env.MONGO_URI;
const sendToEmail = process.env.BACKUP_EMAIL;
const backupDir = path.join(__dirname, 'backups');

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, 
  },
});

// Utility to export all collections
async function backupMongoToJSON() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup-${timestamp}`);
  fs.mkdirSync(backupPath, { recursive: true });

  await mongoose.connect(mongoUri);
  console.log(`[${new Date().toLocaleString()}] Connected to MongoDB`);

  const collections = await mongoose.connection.db.listCollections().toArray();

  for (const col of collections) {
    const name = col.name;
    const data = await mongoose.connection.db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(backupPath, `${name}.json`), JSON.stringify(data, null, 2));
  }

  console.log('Collections dumped to JSON');

  // Zip backup folder
  const zipPath = `${backupPath}.zip`;
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(backupPath, false);
    archive.finalize();
  });

  console.log('🗜️ Backup zipped');

  // Email the backup
  await transporter.sendMail({
    from: '"DB Backup" <yakshbhesaniya@gmail.com>',
    to: sendToEmail,
    subject: `DB Backup of Your Store - ${timestamp}`,
    text: `Backup created at ${timestamp}`,
    attachments: [
      {
        filename: `backup-${timestamp}.zip`,
        path: zipPath,
      },
    ],
  });

  console.log('Backup emailed successfully');

  // Cleanup
  fs.rmSync(backupPath, { recursive: true, force: true });
  fs.unlinkSync(zipPath);
  console.log('Temporary files cleaned up');

  await mongoose.disconnect();
}

cron.schedule('0 0 * * *', () => {
  console.log(`Starting JSON MongoDB backup...`);
  backupMongoToJSON().catch((err) => {
    console.error('Backup failed:', err);
  });
});
