import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.js';

// Load environment variables
dotenv.config();

async function resetPassword(email, newPassword) {
    console.log('🔄 Resetting password for:', email);
    
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database');

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            console.error('❌ User not found');
            return;
        }

        console.log('\n🔑 Updating password...');
        
        // Set the new password (will be hashed by the pre-save hook)
        user.password = newPassword;
        
        // Save the user (this will trigger the pre-save hook to hash the password)
        await user.save();
        
        console.log('✅ Password updated successfully');
        console.log('\n🔍 New password details:');
        console.log('- New password hash:', user.password.substring(0, 15) + '...');
        console.log('- Hash length:', user.password.length);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
    }
}

// Get email and new password from command line arguments
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
    console.log('Usage: node reset-password.js <email> <new-password>');
    process.exit(1);
}

resetPassword(email, newPassword);
