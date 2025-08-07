import asyncHandler from 'express-async-handler';
import * as userService from '../services/userService.js';
import mongoose from 'mongoose';

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
    try {
        const users = await userService.getUsers();
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            message: 'Error retrieving users',
            ...(process.env.NODE_ENV === 'development' && { 
                error: error.message,
                stack: error.stack
            })
        });
    }
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
    try {
        const user = await userService.getUserById(req.params.id);
        res.json(user);
    } catch (error) {
        // Handle invalid ObjectId format
        if (error.name === 'CastError' || error.message.includes('Invalid user ID format')) {
            return res.status(400).json({
                message: 'Invalid user ID format'
            });
        }
        
        // Handle not found
        if (error.statusCode === 404) {
            return res.status(404).json({
                message: 'User not found'
            });
        }
        
        // Handle other errors
        console.error('Error fetching user by ID:', error);
        res.status(500).json({
            message: 'Error retrieving user',
            ...(process.env.NODE_ENV === 'development' && { 
                error: error.message,
                stack: error.stack
            })
        });
    }
});

// @desc    Get user by QR code token
// @route   GET /api/users/qr/:token
// @access  Public
const getUserByQrToken = asyncHandler(async (req, res) => {
    try {
        const user = await userService.getUserByQrToken(req.params.token);
        res.json(user);
    } catch (error) {
        // Handle not found
        if (error.statusCode === 404) {
            return res.status(404).json({
                message: 'User not found with this QR code'
            });
        }
        
        // Handle other errors
        console.error('Error fetching user by QR token:', error);
        res.status(500).json({
            message: 'Error retrieving user',
            ...(process.env.NODE_ENV === 'development' && { 
                error: error.message,
                stack: error.stack
            })
        });
    }
});

// Export all controller functions
export {
    getUsers,
    getUserById,
    getUserByQrToken
};
