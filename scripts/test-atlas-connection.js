import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function testAtlasConnection() {
  // Get Atlas connection string from environment variables
  const atlasUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
  
  if (!atlasUri) {
    console.error('❌ No MongoDB Atlas connection string found in environment variables');
    console.log('\nPlease set either MONGODB_ATLAS_URI or MONGODB_URI in your .env file');
    process.exit(1);
  }
  
  console.log('🔌 Testing MongoDB Atlas connection...');
  console.log(`Connection string: ${atlasUri.replace(/:[^:]*?@/, ':***@')}`);
  
  const client = new MongoClient(atlasUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 10000, // 10 seconds timeout
    socketTimeoutMS: 45000,
  });
  
  try {
    // Test connection
    await client.connect();
    console.log('✅ Successfully connected to MongoDB Atlas!');
    
    // Test the connection with a ping
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Successfully pinged the Atlas deployment');
    
    // Get database info
    const db = client.db();
    const dbInfo = await db.command({ dbStats: 1 });
    
    console.log('\n📊 Atlas Database Info:');
    console.log(`- Name: ${db.databaseName}`);
    console.log(`- Collections: ${dbInfo.collections}`);
    console.log(`- Documents: ${dbInfo.objects}`);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Collections:');
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });
    
    return { success: true };
  } catch (error) {
    console.error('\n❌ Atlas connection failed:', error.message);
    
    // Detailed error analysis
    console.log('\n🔍 Troubleshooting Atlas connection:');
    
    if (error.message.includes('getaddrinfo ENOTFOUND')) {
      console.log('❌ DNS resolution failed. Please check your internet connection.');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('❌ Connection refused. The server might be down or the port might be blocked.');
    } else if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.log('❌ Authentication failed. Please check your username and password in the connection string.');
    } else if (error.message.includes('not authorized')) {
      console.log('❌ Not authorized to access the database. Please check your database user permissions.');
    } else if (error.message.includes('timed out')) {
      console.log('❌ Connection timed out. Please check:');
      console.log('   - Your internet connection');
      console.log('   - If your IP is whitelisted in Atlas (Network Access -> IP Access List)');
      console.log('   - If the server is accessible from your network');
    }
    
    console.log('\n💡 Additional checks:');
    console.log('- Make sure your IP is whitelisted in MongoDB Atlas');
    console.log('- Verify your connection string is correct');
    console.log('- Check if your network allows outbound connections to port 27017');
    
    return { success: false, error: error.message };
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed');
  }
}

// Run the test
testAtlasConnection()
  .then(({ success }) => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
