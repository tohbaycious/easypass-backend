import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    qrCodeToken: {
        type: String,
        unique: true,
        sparse: true
    },
    qrCodeDataUrl: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Generate QR code token and hash password before saving
userSchema.pre('save', async function(next) {
    try {
        // Generate QR code token if this is a new user
        if (this.isNew) {
            // Generate a unique token using user's ID and current timestamp
            const uniqueValue = `${this._id}-${Date.now()}`;
            this.qrCodeToken = uniqueValue;
        }
        
        // Only hash the password if it has been modified (or is new)
        if (this.isModified('password')) {
            // Generate a salt
            const salt = await bcrypt.genSalt(10);
            // Hash the password with the salt
            this.password = await bcrypt.hash(this.password, salt);
        }
        
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password for login
userSchema.methods.matchPassword = async function(enteredPassword) {
    console.log('🔑 matchPassword called');
    console.log('   Entered password length:', enteredPassword?.length || 0);
    console.log('   Stored password hash length:', this.password?.length || 0);
    console.log('   Stored hash prefix:', this.password ? this.password.substring(0, 10) + '...' : 'none');
    
    if (!enteredPassword || !this.password) {
        console.error('❌ Missing password or hash for comparison');
        console.log('   Entered password exists:', !!enteredPassword);
        console.log('   Stored password exists:', !!this.password);
        return false;
    }
    
    try {
        console.log('   Starting bcrypt comparison...');
        const startTime = Date.now();
        const isMatch = await bcrypt.compare(enteredPassword, this.password);
        const duration = Date.now() - startTime;
        
        console.log(`✅ Bcrypt comparison completed in ${duration}ms`);
        console.log('   Passwords match:', isMatch);
        
        if (!isMatch) {
            console.log('   Hash details:', {
                storedHash: this.password,
                storedHashStart: this.password.substring(0, 10) + '...',
                storedHashEnd: '...' + this.password.substring(this.password.length - 10),
                hashLength: this.password.length
            });
        }
        
        return isMatch;
    } catch (error) {
        console.error('❌ Error in bcrypt comparison:', {
            message: error.message,
            stack: error.stack,
            errorType: error.constructor.name
        });
        
        // Try to detect common issues
        if (error.message.includes('data and hash are required')) {
            console.error('   Error: Data and hash are required for comparison');
        }
        if (error.message.includes('Invalid salt version')) {
            console.error('   Error: Invalid hash format - possible corruption');
        }
        
        return false;
    }
};

// Create a compound index for better query performance
userSchema.index({ username: 1, email: 1 });

const User = mongoose.model('User', userSchema);

export default User;
