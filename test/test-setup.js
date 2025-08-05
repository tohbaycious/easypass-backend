import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';
import { connectDB, clearDatabase, closeDatabase } from './test-db.js';

// Load environment variables from .env file
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    config({ path: resolve(__dirname, '../../.env') });
} catch (error) {
    console.warn('No .env file found, using default environment variables');
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

// Global test timeout (2 minutes)
const TEST_TIMEOUT = 120000;
process.env.TEST_TIMEOUT = TEST_TIMEOUT.toString();

// Set up test database connection with error handling
before(async function() {
    this.timeout(60000); // 60 second timeout for setup
    
    try {
        console.log('Setting up test database...');
        
        // Close any existing connections first
        if (mongoose.connection.readyState !== 0) { // 0 = disconnected
            console.log('Closing existing MongoDB connection...');
            await mongoose.connection.close();
        }
        
        // Connect to the test database
        console.log('Connecting to test database...');
        await connectDB();
        
        // Verify connection is established
        if (mongoose.connection.readyState !== 1) { // 1 = connected
            throw new Error('Failed to establish database connection');
        }
        
        console.log('Test database setup complete');
    } catch (error) {
        console.error('❌ Failed to set up test database:', error);
        // Attempt to close the database connection if it was partially opened
        try {
            await closeDatabase();
        } catch (closeError) {
            console.error('Error closing database connection:', closeError);
        }
        process.exit(1); // Fail the test run if we can't connect to the database
    }
});

// Clear all test data after each test
afterEach(async function() {
    this.timeout(10000); // 10 second timeout for cleanup
    
    try {
        // Only clear if we have a valid connection
        if (mongoose.connection.readyState === 1) {
            await clearDatabase();
            console.log('Test data cleared');
        } else {
            console.log('Skipping test data clear - no active connection');
        }
    } catch (error) {
        console.error('❌ Failed to clear test data:', error);
        // Don't throw here to allow other tests to run
    }
});

// Close the database connection after all tests with error handling
after(async function() {
    this.timeout(60000); // 60 second timeout for teardown (allows time for MongoDB to shut down)
    try {
        console.log('Tearing down test database...');
        await closeDatabase();
        console.log('Test database teardown complete');
    } catch (error) {
        console.error('❌ Error during test database teardown:', error);
        // Force exit if we can't close the database properly
        process.exit(1);
    }
});
