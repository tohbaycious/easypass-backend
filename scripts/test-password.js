import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.js';

// Load environment variables
dotenv.config();

// Test password comparison
async function testPasswordComparison(email, password) {
    console.log('🔍 Testing password comparison for:', email);
    
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to database');

        // Find user
        const user = await User.findOne({ email }).select('+password').lean();
        if (!user) {
            console.error('❌ User not found');
            return;
        }

        console.log('\n📋 User details:');
        console.log('- ID:', user._id);
        console.log('- Email:', user.email);
        console.log('- Has password:', !!user.password);
        console.log('- Password hash length:', user.password ? user.password.length : 0);
        
        if (user.password) {
            console.log('\n🔑 Password hash analysis:');
            console.log('- Hash prefix:', user.password.substring(0, 10) + '...');
            console.log('- Hash algorithm:', user.password.substring(0, 3) === '$2a$' ? 'bcrypt' : 'Unknown');
            console.log('- Cost factor:', user.password.split('$')[2]);
            
            // Test direct bcrypt compare
            console.log('\n🔍 Testing bcrypt comparison...');
            const startTime = Date.now();
            const isMatch = await bcrypt.compare(password, user.password);
            const duration = Date.now() - startTime;
            
            console.log(`✅ Bcrypt compare completed in ${duration}ms`);
            console.log('Password match:', isMatch);
            
            if (!isMatch) {
                console.log('\n🔍 Possible issues:');
                console.log('1. The password might be incorrect');
                console.log('2. The password might have been hashed with a different algorithm');
                console.log('3. The hash might be corrupted');
                
                // Try with a known good password
                console.log('\n🔑 Test with known password:');
                const testHash = await bcrypt.hash('test123', 10);
                const testMatch = await bcrypt.compare('test123', testHash);
                console.log('Test password comparison:', testMatch ? '✅ Works' : '❌ Failed');
            }
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from database');
    }
}

// Get email and password from command line arguments
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.log('Usage: node test-password.js <email> <password>');
    process.exit(1);
}

testPasswordComparison(email, password);
