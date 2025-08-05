import { connectDB, getDb, closeConnection } from '../src/config/db.js';

async function testConnection() {
  try {
    console.log('🔄 Testing MongoDB connection...');
    
    // Connect to the database
    const { client, db } = await connectDB();
    
    // Get database info
    const dbInfo = await db.command({ dbStats: 1 });
    console.log('✅ Database connection successful!');
    console.log('📊 Database Stats:');
    console.log(`- Name: ${db.databaseName}`);
    console.log(`- Collections: ${dbInfo.collections}`);
    console.log(`- Documents: ${dbInfo.objects}`);
    console.log(`- Storage Size: ${(dbInfo.storageSize / 1024 / 1024).toFixed(2)} MB`);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Collections:');
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });
    
    // Test a sample query if there are collections
    if (collections.length > 0) {
      const sampleCollection = collections[0].name;
      const count = await db.collection(sampleCollection).countDocuments();
      console.log(`\n📝 Sample collection '${sampleCollection}' has ${count} documents`);
      
      if (count > 0) {
        const sampleDoc = await db.collection(sampleCollection).findOne({});
        console.log('📄 Sample document:');
        console.log(JSON.stringify(sampleDoc, null, 2));
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    // Close the connection
    await closeConnection();
    console.log('\n🔌 Connection closed');
  }
}

// Run the test
testConnection()
  .then(({ success }) => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
