const { MongoClient } = require('mongodb');
const { EJSON } = require('bson'); // ✅ Required to parse EJSON
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
require('dotenv').config();

const backupRoot = path.join(__dirname, 'backups');
const extractDir = path.join(__dirname, 'backupFiles');
const mongoUri = process.env.MONGO_URI;
const dbName = 'inventory';

const client = new MongoClient(mongoUri);

async function findLatestZip(folderPath) {
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.zip'));
  if (!files.length) throw new Error('No .zip files found in backup folder.');

  const sorted = files.sort((a, b) =>
    fs.statSync(path.join(folderPath, b)).mtime - fs.statSync(path.join(folderPath, a)).mtime
  );

  return path.join(folderPath, sorted[0]);
}

async function unzipBackup(zipFile, extractTo) {
  if (fs.existsSync(extractTo)) {
    fs.rmSync(extractTo, { recursive: true, force: true });
  }

  await fs.createReadStream(zipFile)
    .pipe(unzipper.Extract({ path: extractTo }))
    .promise();

  console.log('Unzipped:', path.basename(zipFile));
}

(async () => {
  try {
    console.log('Finding latest backup...');
    const latestZip = await findLatestZip(backupRoot);

    console.log('Unzipping:', latestZip);
    await unzipBackup(latestZip, extractDir);

    await client.connect();
    const db = client.db(dbName);

    const files = fs.readdirSync(extractDir).filter(file => file.endsWith('.json'));
    if (!files.length) {
      console.log('No JSON files found in extracted folder.');
      return;
    }

    for (const file of files) {
      const collection = path.basename(file, '.json');
      const filePath = path.join(extractDir, file);
      const content = fs.readFileSync(filePath, 'utf-8').trim();

      if (!content || content === '[]') {
        console.log(`Creating empty collection: ${collection}`);
        await db.createCollection(collection);
        continue;
      }

      console.log(`Restoring collection: ${collection}...`);

      const parsed = EJSON.parse(content); // ✅ Properly parse EJSON to preserve ObjectId, Dates, etc.

      await db.collection(collection).deleteMany({}); // optional: reset collection
      if (parsed.length) {
        await db.collection(collection).insertMany(parsed);
        console.log(`Inserted ${parsed.length} documents into ${collection}`);
      }
    }
  } catch (err) {
    console.error('❌ Error during restore:', err);
  } finally {
    await client.close();
  }
})();
