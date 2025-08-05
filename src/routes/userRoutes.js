import express from 'express';
import { registerUser, authUser, getUsers, getUserById, getUserByQrToken } from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateRegisterUser, validateAuthUser } from '../middleware/validation.js';

const router = express.Router();

// Authentication routes
router.post('/register', validateRegisterUser, registerUser);  // Register a new user
router.post('/login', validateAuthUser, authUser);             // Authenticate user & get token

// QR code route (public)
router.get('/qr/:token', getUserByQrToken); // Get user by QR code token

// Protected routes
router.route('/')
    .get(protect, getUsers);             // Get all users (protected)

router.route('/:id')
    .get(protect, getUserById);          // Get a single user by ID (protected)

export default router;
