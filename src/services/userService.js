import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';

// Generate JWT token
const generateToken = (id) => {
    try {
        if (!id) {
            throw new Error('User ID is required to generate token');
        }
        
        const userId = id.toString();
        const now = Math.floor(Date.now() / 1000);
        
        // Create payload with all required claims
        const payload = {
            sub: userId,        // Standard JWT subject claim
            userId: userId,     // For backward compatibility
            id: userId,         // For backward compatibility
            iat: now,           // Issued at time
            iss: 'easypass-api', // Issuer
            aud: 'easypass-client' // Audience
        };
        
        // Sign the token with options
        const token = jwt.sign(
            payload, 
            process.env.JWT_SECRET || 'your_jwt_secret',
            {
                algorithm: 'HS256',  // Explicitly set the algorithm
                expiresIn: '7d'      // 7 days from now
            }
        );
        
        console.log('Generated JWT token for user:', userId);
        return token;
    } catch (error) {
        console.error('Error generating token:', error);
        throw new Error('Failed to generate authentication token');
    }
};

// Generate a secure random token for QR codes
const generateQrToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Register a new user
 * @param {Object} userData - User data including username, email, and password
 * @returns {Promise<Object>} User data with token and QR code
 */
export const registerUser = async (userData) => {
    console.log({userData});
    const { username, email, password } = userData;
    
    // Check if user already exists
    const existingUser = await User.findOne({
        $or: [
            { email: email.toLowerCase() },
            { username: username.toLowerCase() }
        ]
    });

    if (existingUser) {
        const error = new Error('User with this email or username already exists');
        error.statusCode = 400;
        throw error;
    }

    // Generate QR code token
    const qrCodeToken = generateQrToken();
    
    try {
        // Create and save user with Mongoose
        const user = new User({
            username,
            email: email.toLowerCase(),
            password: password, // Let the pre-save hook handle the hashing
            qrCodeToken,
            isAdmin: false
        });

        // Save the user first to get the _id
        const savedUser = await user.save();
        
        // Generate QR code data URL with user ID
        const qrCodeData = {
            userId: savedUser._id.toString(),
            email: email.toLowerCase(),
            token: qrCodeToken,
            timestamp: new Date().toISOString()
        };
        
        // Generate QR code with the updated data
        const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrCodeData));
        
        // Update the user with the generated QR code
        savedUser.qrCodeDataUrl = qrCodeDataUrl;
        await savedUser.save();
        
        // Return user data with token (excluding password)
        const userResponse = {
            _id: savedUser._id,
            username: savedUser.username,
            email: savedUser.email,
            qrCodeDataUrl: savedUser.qrCodeDataUrl,
            qrCodeToken: savedUser.qrCodeToken,
            isAdmin: savedUser.isAdmin || false,
            token: generateToken(savedUser._id.toString())
        };

        return userResponse;
    } catch (error) {
        console.error('Error in user registration:', error);
        throw error;
    }
};

/**
 * Authenticate a user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<Object>} User data with token
 * @throws {Error} If authentication fails or input is invalid
 */
export const authUser = async (email, password) => {
    console.log('Auth attempt for email:', email);
    
    // Input validation
    if (!email || !password) {
        console.error('Missing email or password');
        const error = new Error('Email and password are required');
        error.statusCode = 400;
        throw error;
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
        console.error('Invalid input types - email:', typeof email, 'password:', typeof password);
        const error = new Error('Email and password must be strings');
        error.statusCode = 400;
        throw error;
    }

    try {
        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();
        console.log('🔍 Looking up user with email:', normalizedEmail);
        
        // Find user by email
        const user = await User.findOne({ email: normalizedEmail }).select('+password').lean();
        console.log('✅ User found:', user ? `Yes (${user._id})` : 'No');

        if (!user) {
            console.error('❌ No user found with email:', normalizedEmail);
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        // Log user details (excluding sensitive data)
        console.log('📋 User details:', {
            id: user._id,
            email: user.email,
            hasPassword: !!user.password,
            passwordHash: user.password ? `${user.password.substring(0, 15)}...` : 'none',
            isAdmin: user.isAdmin || false
        });
        
        // Check if password is valid using the model's matchPassword method
        console.log('🔑 Starting password validation...');
        console.log('   Provided password:', password);
        
        // Convert to Mongoose document to use instance methods
        const userDoc = new User(user);
        const isPasswordValid = await userDoc.matchPassword(password);
        
        console.log('✅ Password validation result:', isPasswordValid);

        if (!isPasswordValid) {
            console.error('❌ Invalid password for user:', user.email);
            console.log('   Stored password hash:', user.password ? `${user.password.substring(0, 15)}...` : 'none');
            
            // Additional debug: Try direct bcrypt compare
            try {
                const directCompare = await bcrypt.compare(password, user.password);
                console.log('   Direct bcrypt.compare result:', directCompare);
            } catch (bcryptError) {
                console.error('   Error in direct bcrypt compare:', bcryptError.message);
            }
            
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        // Check if user is active
        if (user.isSuspended || user.isDeleted) {
            console.error('Account deactivated for user:', user.email);
            const error = new Error('Your account has been deactivated');
            error.statusCode = 403; // Forbidden
            throw error;
        }

        // Generate token
        const token = generateToken(user._id.toString());
        console.log('Generated token for user:', user.email);

        // Return user data with token
        const userData = {
            _id: user._id,
            username: user.username,
            email: user.email,
            qrCodeDataUrl: user.qrCodeDataUrl || '',
            qrCodeToken: user.qrCodeToken || '',
            token: token,
            isAdmin: user.isAdmin || false,
            createdAt: user.createdAt
        };
        
        console.log('Authentication successful for user:', user.email);
        return userData;

    } catch (error) {
        // Log the error but don't expose sensitive information
        console.error(`Authentication error for email: ${email}`, error);
        
        // If it's not a custom error with status code, make it a 500
        if (!error.statusCode) {
            error.statusCode = 500;
            error.message = 'An error occurred during authentication';
        }
        
        throw error;
    }
};

/**
 * Get user by ID
 * @param {string} id - User ID
 * @returns {Promise<Object>} User data
 */
export const getUserById = async (id) => {
    try {
        // Mongoose automatically validates ObjectId format
        const user = await User.findById(id).select('-password');
        
        if (user) {
            return user;
        } else {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }
    } catch (error) {
        console.error('Error in getUserById:', error);
        if (error.name === 'CastError') {
            const err = new Error('Invalid user ID format');
            err.statusCode = 400;
            throw err;
        }
        if (!error.statusCode) {
            error.statusCode = 500;
        }
        throw error;
    }
};

/**
 * Get all users
 * @returns {Promise<Array>} List of users
 */
export const getUsers = async () => {
    try {
        // Exclude password field and convert to plain JavaScript objects
        const users = await User.find({}).select('-password').lean();
        return users;
    } catch (error) {
        console.error('Error in getUsers:', error);
        if (!error.statusCode) {
            error.statusCode = 500;
        }
        throw error;
    }
};

/**
 * Get user by QR code token
 * @param {string} token - QR code token
 * @returns {Promise<Object>} User data
 */
export const getUserByQrToken = async (token) => {
    try {
        // Find user by QR code token and exclude password
        const user = await User.findOne({ qrCodeToken: token })
            .select('-password')
            .lean();
        
        if (user) {
            return user;
        } else {
            const error = new Error('User not found with this QR code');
            error.statusCode = 404;
            throw error;
        }
    } catch (error) {
        console.error('Error in getUserByQrToken:', error);
        if (!error.statusCode) {
            error.statusCode = 500;
        }
        throw error;
    }
};
