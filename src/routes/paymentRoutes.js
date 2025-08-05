import express from 'express';
import { body } from 'express-validator';
import { 
  webhookHandler, 
  simulatePayment, 
  getPaymentHistory, 
  getPaymentById,
  verifyPayment,
  hasPaidToday
} from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Payment verification and details
router.post('/verify', verifyPayment);
router.get('/history', getPaymentHistory);
router.get('/has-paid-today/:userId', hasPaidToday);
router.get('/:id', getPaymentById);

// Test endpoint for simulating payments (for development only)
if (process.env.NODE_ENV !== 'production') {
  router.post(
    '/simulate',
    [
      body('amount', 'Amount is required and must be a positive number')
        .isFloat({ min: 0.01 })
        .toFloat(),
      body('currency', 'Currency must be a string')
        .optional()
        .isString()
        .isLength({ min: 3, max: 3 }),
      body('paymentMethod', 'Payment method must be a string')
        .optional()
        .isString(),
    ],
    simulatePayment
  );
}

export default router;
