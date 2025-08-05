import http from 'http';
import path from 'path';
import fs from 'fs';
import createApp from './app/app.js';
import dotenv from 'dotenv';
import { 
  handleUncaughtException, 
  handleUnhandledRejection 
} from './middleware/errorHandler.js';
import connectDB from './config/db.js';
import mongoose from 'mongoose';

// Load environment variables with explicit path and debug logging
// Look for .env in the parent directory (backend/)
// const envPath = path.resolve(process.cwd(), '..', '.env');
// console.log(`Loading environment variables from: ${envPath}`);

dotenv.config();

connectDB()


// Log environment variables for debugging
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET ? '***' : 'Not set',
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY ? '***' : 'Not set',
  MONGODB_URI: process.env.MONGODB_URI ? '***' : 'Using default local MongoDB'
});

// Handle uncaught exceptions - must be at the top level
handleUncaughtException();

const startServer = async () => {
    // Create the app first
    const app = await createApp();
    const server = http.createServer(app);
    
    // Handle unhandled promise rejections
    handleUnhandledRejection(server);
    
};


mongoose.connection.once('open', () => {
  console.log('MongoDB connected');
  // Start the server
  startServer().catch(err => {
      console.error('Failed to start server:', err);
      process.exit(1);
  });
    
});

mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
});