import express from 'express';
import { registerUser, loginUser } from '../controllers/authController.js';
import { validateRegisterUser, validateAuthUser } from '../middleware/validation.js';

const router = express.Router();

// Authentication routes
router.post('/register', validateRegisterUser, registerUser);  // Register a new user
router.post('/login', validateAuthUser, loginUser);             // Login user & get token

export default router;
