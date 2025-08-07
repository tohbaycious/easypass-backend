import asyncHandler from 'express-async-handler';
import { validationResult } from 'express-validator';
import * as userService from '../services/userService.js';

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array().map(err => `${err.param}: ${err.msg}`).join(', '));
    }

    try {
        const user = await userService.registerUser(req.body);
        res.status(201).json(user);
    } catch (error) {
        console.error('Registration error:', error);
        console.log({error})
        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                message: 'Validation failed',
                errors: messages
            });
        }
        
        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                message: `${field} already exists`
            });
        }
        
        // Handle other errors
        res.status(error.statusCode || 500).json({
            message: error.message || 'Server error',
            ...(process.env.NODE_ENV === 'development' && { 
                stack: error.stack,
                ...(error.name && { error: error.name })
            })
        });
    }
});

/**
 * @desc    Login user & get token
 * @route   POST /api/users/login
 * @access  Public
 */
const loginUser = asyncHandler(async (req, res) => {
    console.log('Login request received:', { 
        email: req.body.email,
        hasPassword: !!req.body.password 
    });
    
    // Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                param: err.param,
                message: err.msg
            }))
        });
    }

    const { email, password } = req.body;
    
    try {
        console.log('Attempting to authenticate user:', email);
        
        // Login user
        const user = await userService.loginUser(email, password);
        
        if (!user || !user.token) {
            console.error('Authentication failed - no user or token returned');
            return res.status(401).json({
                success: false,
                message: 'Authentication failed',
                error: 'Invalid credentials'
            });
        }

        console.log('User authenticated successfully, setting auth cookie');
        
        // Set secure HTTP-only cookie with token
        res.cookie('token', user.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
            domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined
        });

        // Return user data with token but without sensitive information
        const { password: _, ...userData } = user;
        
        console.log('Sending successful login response with JWT token');
        res.status(200).json({
            success: true,
            message: 'Authentication successful',
            data: {
                ...userData,
                token: user.token // Include the JWT token in the response
            }
        });
        
    } catch (error) {
        // Log the error for debugging (without sensitive data)
        console.error(`Login attempt failed for email: ${email}`, error);
        
        // Determine the appropriate status code and message
        const statusCode = error.statusCode || 500;
        let message = 'Authentication failed';
        
        // Provide more specific messages for client-side handling
        if (statusCode === 401) {
            message = 'Invalid email or password';
        } else if (statusCode === 403) {
            message = 'Account is deactivated';
        } else if (statusCode === 400) {
            message = error.message || 'Invalid request';
        }
        
        // Send error response
        res.status(statusCode).json({
            success: false,
            message,
            ...(process.env.NODE_ENV === 'development' && {
                error: error.message,
                stack: error.stack
            })
        });
    }
});

export { registerUser, loginUser };
