import express from 'express';
import { getUsers, getUserById, getUserByQrToken } from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// QR code route (public)
router.get('/qr/:token', getUserByQrToken); // Get user by QR code token

// Protected routes
router.route('/')
    .get(protect, getUsers);             // Get all users (protected)

router.route('/:id')
    .get(protect, getUserById);          // Get a single user by ID (protected)

export default router;
