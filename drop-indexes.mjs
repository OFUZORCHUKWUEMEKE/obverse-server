import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017/mantle_starknet';

async function dropOldIndexes() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const collection = db.collection('wallets');

    // Get all indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes:');
    indexes.forEach(idx => console.log(`  - ${idx.name}`));

    // Drop old Para wallet indexes
    const indexesToDrop = ['paraWalletId_1', 'address_1'];

    for (const indexName of indexesToDrop) {
      try {
        const indexExists = indexes.some(idx => idx.name === indexName);
        if (indexExists) {
          await collection.dropIndex(indexName);
          console.log(`✅ Dropped index: ${indexName}`);
        } else {
          console.log(`⚠️  Index not found (already dropped?): ${indexName}`);
        }
      } catch (error) {
        console.error(`❌ Error dropping index ${indexName}:`, error.message);
      }
    }

    // Show remaining indexes
    const remainingIndexes = await collection.indexes();
    console.log('\n📋 Remaining indexes:');
    remainingIndexes.forEach(idx => console.log(`  - ${idx.name}`));

    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

dropOldIndexes();
