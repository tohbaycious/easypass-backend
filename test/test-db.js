import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer;
let isConnected = false;

// Set default timeout for all database operations
const DB_OPERATION_TIMEOUT = 30000; // 30 seconds

// Connect to the in-memory database
const connectDB = async () => {
    // If already connected, return the existing connection
    if (isConnected) {
        console.log('Using existing database connection');
        return mongoose.connection;
    }

    try {
        console.log('Starting MongoDB Memory Server...');
        
        // Close any existing connections first
        if (mongoose.connection.readyState !== 0) {
            console.log('Closing existing MongoDB connection...');
            await mongoose.connection.close();
        }
        
        // Create an in-memory MongoDB instance with specific version and options
        mongoServer = await MongoMemoryServer.create({
            instance: {
                storageEngine: 'wiredTiger',
                port: 27017, // Use default MongoDB port
            },
            binary: {
                version: '6.0.8', // Use a specific MongoDB version
                skipMD5: true,
            },
            autoStart: true,
        });

        const uri = mongoServer.getUri();
        console.log(`MongoDB Memory Server URI: ${uri}`);
        
        // Configure mongoose connection options
        const mongooseOpts = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: DB_OPERATION_TIMEOUT,
            socketTimeoutMS: 45000,
            connectTimeoutMS: DB_OPERATION_TIMEOUT,
            heartbeatFrequencyMS: 10000,
        };

        console.log('Connecting to MongoDB Memory Server...');
        await mongoose.connect(uri, mongooseOpts);
        isConnected = true;
        
        // Verify the connection
        const conn = mongoose.connection;
        conn.on('error', (error) => console.error('MongoDB connection error:', error));
        conn.once('open', () => console.log('MongoDB connection open'));
        
        console.log('In-memory test database connected successfully');
    } catch (error) {
        console.error('In-memory test database connection error:', error);
        if (mongoServer) {
            await mongoServer.stop();
        }
        throw error;
    }
};

// Clear the test database
const clearDatabase = async () => {
    try {
        if (!mongoose.connection.db) {
            console.log('No database connection available for clearing');
            return;
        }
        
        const collections = mongoose.connection.collections;
        
        for (const key in collections) {
            const collection = collections[key];
            try {
                await collection.deleteMany({});
                console.log(`Cleared collection: ${key}`);
            } catch (error) {
                console.error(`Error clearing collection ${key}:`, error);
            }
        }
        
        console.log('Test database cleared');
    } catch (error) {
        console.error('Error clearing test database:', error);
        throw error;
    }
};

// Close the database connection and stop the in-memory server
const closeDatabase = async () => {
    try {
        // Close the Mongoose connection if connected
        if (mongoose.connection.readyState !== 0) { // 0 = disconnected
            console.log('Closing Mongoose connection...');
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
            console.log('Mongoose connection closed');
        }
        
        // Stop the in-memory MongoDB server if it exists
        if (mongoServer) {
            console.log('Stopping MongoDB Memory Server...');
            await mongoServer.stop();
            console.log('MongoDB Memory Server stopped');
        }
        
        console.log('In-memory test database connection closed successfully');
    } catch (error) {
        console.error('Error closing in-memory test database:', error);
        throw error;
    }
};

// Handle process termination
process.on('SIGINT', async () => {
    console.log('SIGINT received. Closing MongoDB Memory Server...');
    await closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Closing MongoDB Memory Server...');
    await closeDatabase();
    process.exit(0);
});

export { connectDB, clearDatabase, closeDatabase };
