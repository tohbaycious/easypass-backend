// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// import { setTimeout } from 'timers/promises';

// // Load environment variables
// dotenv.config();

// // Connection URI - uses MONGODB_URI from .env or falls back to local MongoDB
// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/easypass';

// // Cache the connection to prevent multiple connections
// let cached = global.mongoose;

// if (!cached) {
//   cached = global.mongoose = { 
//     conn: null, 
//     promise: null,
//     isConnecting: false,
//     retryCount: 0,
//     maxRetries: 5,
//     retryDelay: 5000 // 5 seconds
//   };
// }

// // Default connection options
// const defaultOptions = {
//   // Connection options
//   autoIndex: true, // Build indexes
//   maxPoolSize: 50, // Maximum number of connections in the connection pool
//   serverSelectionTimeoutMS: 10000, // Time to wait for server selection (10 seconds)
//   socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
//   connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
//   family: 4, // Use IPv4, skip trying IPv6
  
//   // SSL/TLS options
//   tls: process.env.NODE_ENV === 'production', // Use TLS in production
//   tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production', // For development only
  
//   // Authentication
//   authMechanism: 'DEFAULT',
//   authSource: 'admin',
  
//   // Connection monitoring
//   heartbeatFrequencyMS: 10000, // How often to check the connection status
  
//   // Retry logic
//   retryReads: true,
//   retryWrites: true,
  
//   // Replica set options (if using Atlas)
//   ...(process.env.MONGODB_REPLICA_SET && { 
//     replicaSet: process.env.MONGODB_REPLICA_SET,
//     directConnection: false
//   }),
  
//   // Compression
//   compressors: ['zlib', 'snappy', 'zstd']
// };

// // Build the MongoDB connection string
// const buildMongoUri = () => {
//   let uri = process.env.MONGODB_URI;
  
//   // If no URI is provided, use localhost as fallback
//   if (!uri) {
//     console.warn('MONGODB_URI not set, falling back to localhost');
//     uri = 'mongodb://localhost:27017/easypass';
//   }
  
//   // Add authentication if credentials are provided
//   if (process.env.MONGODB_USER && process.env.MONGODB_PASSWORD) {
//     const url = new URL(uri);
//     url.username = encodeURIComponent(process.env.MONGODB_USER);
//     url.password = encodeURIComponent(process.env.MONGODB_PASSWORD);
//     uri = url.toString();
//   }
  
//   return uri;
// };

// // Get MongoDB connection options
// const getMongoOptions = () => {
//   const options = { ...defaultOptions };
  
//   // Add replica set if specified
//   if (process.env.MONGODB_REPLICA_SET) {
//     options.replicaSet = process.env.MONGODB_REPLICA_SET;
//   }
  
//   return options;
// };

// /**
//  * Attempt to establish a connection to MongoDB with retry logic
//  * @private
//  */
// async function attemptConnection() {
//   const options = getMongoOptions();
//   const uri = buildMongoUri();
  
//   try {
//     console.log(`🔌 Attempting to connect to MongoDB (attempt ${cached.retryCount + 1}/${cached.maxRetries})...`);
    
//     // Log connection details (without credentials)
//     const logUri = new URL(uri);
//     if (logUri.password) logUri.password = '***';
//     console.log(`Connecting to: ${logUri.toString()}`);
    
//     const connection = await mongoose.connect(uri, options);
    
//     console.log('✅ Successfully connected to MongoDB');
//     cached.retryCount = 0; // Reset retry counter on successful connection
    
//     // Log connection status
//     const { host, port, name } = connection.connection;
//     console.log(`MongoDB connected to ${host}:${port}/${name}`);
    
//     return connection;
//   } catch (error) {
//     cached.retryCount++;
    
//     if (cached.retryCount <= cached.maxRetries) {
//       console.warn(`⏳ Connection attempt ${cached.retryCount} failed. Retrying in ${cached.retryDelay/1000} seconds...`);
//       console.error('Connection error:', error.message);
      
//       // Wait before retrying
//       await setTimeout(cached.retryDelay);
//       return attemptConnection();
//     }
    
//     console.error('❌ Failed to connect to MongoDB after multiple attempts');
//     throw new Error(`Failed to connect to MongoDB after ${cached.maxRetries} attempts: ${error.message}`);
//   }
// }

// /**
//  * Connect to the MongoDB database using Mongoose with retry logic
//  * @returns {Promise<mongoose.Connection>} Mongoose connection instance
//  */
// async function connectDB() {
//   // Return existing connection if available
//   if (cached.conn) {
//     return cached.conn;
//   }

//   // Prevent multiple connection attempts
//   if (!cached.promise && !cached.isConnecting) {
//     cached.isConnecting = true;
    
//     try {
//       cached.promise = attemptConnection();
//       cached.conn = await cached.promise;
//       return cached.conn;
//     } catch (error) {
//       console.error('❌ Fatal error connecting to MongoDB:', error);
//       cached.promise = null;
//       cached.isConnecting = false;
//       throw error;
//     } finally {
//       cached.isConnecting = false;
//     }
//   }
  
//   // If we're already trying to connect, wait for the existing promise
//   if (cached.promise) {
//     return cached.promise;
//   }
  
//   throw new Error('Unable to establish database connection');
// }

// /**
//  * Get the Mongoose connection
//  * @returns {mongoose.Connection} Mongoose connection instance
//  */
// function getConnection() {
//   if (!cached.conn) {
//     throw new Error('No database connection. Call connectDB() first.');
//   }
//   return cached.conn;
// }

// /**
//  * Close the database connection
//  * @returns {Promise<void>}
//  */
// async function closeDB() {
//   if (cached.conn) {
//     await mongoose.disconnect();
//     cached.conn = null;
//     cached.promise = null;
//     console.log('MongoDB connection closed');
//   }
// }

// // Event listeners for connection events
// mongoose.connection.on('connected', () => {
//   console.log('Mongoose connected to DB');
// });

// mongoose.connection.on('error', (err) => {
//   console.error('Mongoose connection error:', err);
// });

// mongoose.connection.on('disconnected', () => {
//   console.log('Mongoose disconnected from DB');
// });

// // Handle application termination
// const cleanup = async () => {
//   try {
//     await closeDB();
//     console.log('Database connection closed through app termination');
//     process.exit(0);
//   } catch (err) {
//     console.error('Error during cleanup:', err);
//     process.exit(1);
//   }
// };

// // Set up process event handlers
// process.on('SIGINT', cleanup);
// process.on('SIGTERM', cleanup);

// // Handle unhandled promise rejections
// process.on('unhandledRejection', (err) => {
//   console.error('Unhandled Rejection:', err);
//   // Close server and exit process
//   if (process.env.NODE_ENV === 'production') {
//     process.exit(1);
//   }
// });

// // Handle uncaught exceptions
// process.on('uncaughtException', (err) => {
//   console.error('Uncaught Exception:', err);
//   // In production, restart the process
//   if (process.env.NODE_ENV === 'production') {
//     process.exit(1);
//   }
// });

// export { connectDB, getConnection, closeDB };

import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
    }
};

export default connectDB;