import axios from 'axios';
import User from '../models/User.js';
import { 
    handlePaymentWebhook, 
    getPaymentByIdService,
    getPaymentHistoryService,
    processPayment,
    saveVerifiedPayment,
    verifyPaymentWithPaystack,
    hasPaidTodayService
} from '../services/paymentService.js';
import { validationResult } from 'express-validator';

/**
 * @desc    Handle payment webhook
 * @route   POST /api/payments/webhook
 * @access  Public (should be secured with webhook signature verification in production)
 */
export const webhookHandler = async (req, res) => {
    try {
        // In production, verify the webhook signature here
        // Example: verifyWebhookSignature(req.headers, req.rawBody);

        // Process the payment
        const result = await handlePaymentWebhook(req.body);

        res.status(200).json({
            success: true,
            message: 'Payment processed successfully',
            data: result
        });
    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Payment processing failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Simulate a successful payment (for testing)
 * @route   POST /api/payments/simulate
 * @access  Private (for testing purposes)
 */
export const simulatePayment = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { userId, amount, currency = 'USD', paymentMethod = 'test' } = req.body;

        // Simulate a successful payment
        const paymentData = {
            amount: parseFloat(amount),
            currency,
            paymentMethod,
            description: 'Test payment',
            metadata: {
                test: true,
                simulatedAt: new Date().toISOString()
            }
        };

        // Process the payment
        const result = await processPayment(userId, paymentData);
        
        // Add a reference field to the response data that matches what the verification endpoint expects
        const responseData = {
            ...result,
            // Add a reference field that starts with 'test_' to be recognized as a test payment
            reference: `test_${Date.now()}`,
            // Ensure the payment ID is also included as paymentId for backward compatibility
            paymentId: result._id || result.id || `pay_${Date.now()}`
        };

        res.status(200).json({
            success: true,
            message: 'Payment simulated successfully',
            data: responseData
        });
    } catch (error) {
        console.error('Error simulating payment:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to simulate payment',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Get a payment by ID
 * @route   GET /api/payments/:id
 * @access  Private (user can only access their own payments)
 */
export const getPaymentById = async (req, res) => {
    try {
        const { id: paymentId } = req.params;
        const userId = req.user?._id;
        const qrCodeToken = req.user?.qrCodeToken;

        // Validate input
        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID is required',
            });
        }

        if (!userId || !qrCodeToken) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        const result = await getPaymentByIdService(paymentId, userId, qrCodeToken);
        
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found or access denied',
            });
        }
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching payment:', error);
        const statusCode = error.name === 'NotFoundError' ? 404 : 400;
        
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Failed to fetch payment',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};


/**
 * @desc    Verify a payment with Paystack
 * @route   POST /api/payments/verify
 * @access  Private
 */
export const verifyPayment = async (req, res) => {
    console.log('🔍 [verifyPayment] Starting payment verification', {
        body: req.body,
        headers: req.headers,
        timestamp: new Date().toISOString()
    });
    
    try {
        const { reference } = req.body;
        const userId = req.user?._id;
        
        // Log detailed request information
        console.log('🔍 [verifyPayment] Request details:', { 
            timestamp: new Date().toISOString(),
            reference, 
            userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            headers: {
                'x-use-cookie-auth': req.headers['x-use-cookie-auth'],
                'authorization': req.headers.authorization ? 'Bearer [REDACTED]' : 'Not provided',
                'cookie': req.cookies ? 'Present' : 'Not present',
                'x-request-id': req.headers['x-request-id'] || 'Not provided'
            },
            body: { ...req.body, reference } // Log the reference from the body
        });
        
        // Log the full user object for debugging (sensitive fields redacted)
        if (req.user) {
            const { password, resetPasswordToken, resetPasswordExpire, ...safeUser } = req.user.toObject ? req.user.toObject() : req.user;
            console.log('🔍 [verifyPayment] Authenticated user:', {
                _id: safeUser._id,
                email: safeUser.email,
                role: safeUser.role,
                isEmailVerified: safeUser.isEmailVerified,
                payment: safeUser.payment,
                tokenVersion: safeUser.tokenVersion,
                createdAt: safeUser.createdAt,
                updatedAt: safeUser.updatedAt
            });
        }
        
        if (!reference) {
            const error = 'Payment reference is required';
            console.error('❌ [verifyPayment] Error:', error);
            return res.status(400).json({
                success: false,
                message: error,
                requiresAuth: false
            });
        }

        if (!userId) {
            const error = 'User not authenticated';
            console.error('❌ [verifyPayment] Error:', error);
            return res.status(401).json({
                success: false,
                message: error,
                requiresAuth: true
            });
        }

        // Get the current user before verification
        console.log('🔍 [verifyPayment] Fetching current user from database');
        const currentUser = await User.findById(userId).select('-password -__v -resetPasswordToken -resetPasswordExpire');
        
        if (!currentUser) {
            const error = `User with ID ${userId} not found`;
            console.error('❌ [verifyPayment] Error:', error);
            return res.status(404).json({
                success: false,
                message: error,
                requiresAuth: true
            });
        }
        
        console.log('🔍 [verifyPayment] Current user before verification:', { 
            userId: currentUser._id,
            email: currentUser.email,
            tokenVersion: currentUser.tokenVersion,
            hasPaidToday: currentUser.hasPaidToday,
            lastPaymentDate: currentUser.lastPaymentDate,
            timestamp: new Date().toISOString()
        });

        // Declare variables in the function scope
        let result;
        let updatedUser;
        
        try {
            // Use the verifyPaymentWithPaystack service to handle verification and saving
            console.log('🔍 [verifyPayment] Calling verifyPaymentWithPaystack with reference:', reference);
            
            result = await verifyPaymentWithPaystack(reference, userId);
            console.log('✅ [verifyPayment] verifyPaymentWithPaystack result:', {
                success: true,
                paymentId: result.payment?._id,
                status: result.payment?.status,
                timestamp: new Date().toISOString()
            });
            
            // Get the updated user data to include in the response
            console.log('🔍 [verifyPayment] Fetching updated user data');
            updatedUser = await User.findById(userId)
                .select('-password -__v -resetPasswordToken -resetPasswordExpire')
                .lean();

            if (!updatedUser) {
                throw new Error('Failed to fetch updated user data after payment verification');
            }

            console.log('✅ [verifyPayment] Updated user data:', {
                userId: updatedUser._id,
                email: updatedUser.email,
                hasPaidToday: updatedUser.hasPaidToday,
                lastPaymentDate: updatedUser.lastPaymentDate,
                tokenVersion: updatedUser.tokenVersion,
                timestamp: new Date().toISOString()
            });

            console.log('✅ [verifyPayment] Verification successful, sending response');
            
            // Send the response with the updated user data
            res.status(200).json({
                success: true,
                message: 'Payment verified successfully',
                payment: result.payment,
                user: updatedUser,
                // Include the current token version to help with session management
                tokenVersion: updatedUser.tokenVersion
            });
            
        } catch (error) {
            console.error('❌ [verifyPayment] Error in verifyPaymentWithPaystack:', {
                error: error.message,
                stack: error.stack,
                reference,
                userId,
                timestamp: new Date().toISOString()
            });
            throw error; // Re-throw to be caught by the outer catch block
        }

    } catch (error) {
        console.error('❌ [verifyPayment] Payment verification error:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code,
            statusCode: error.statusCode || error.status,
            response: error.response?.data,
            request: {
                method: error.config?.method,
                url: error.config?.url,
                headers: error.config?.headers ? {
                    ...error.config.headers,
                    authorization: error.config.headers.authorization ? 'Bearer [REDACTED]' : undefined
                } : undefined,
                data: error.config?.data
            }
        });
        
        // Determine if this is an authentication error
        const isAuthError = error.name === 'JsonWebTokenError' || 
                          error.name === 'TokenExpiredError' ||
                          error.message.includes('jwt') ||
                          error.message.includes('token');
        
        const statusCode = error.response?.status || isAuthError ? 401 : 500;
        const errorMessage = error.response?.data?.message || 
                           (isAuthError ? 'Authentication failed. Please log in again.' : 
                            error.message || 'Payment verification failed');
        
        // Log the error response that will be sent to the client
        console.log('↩️ [verifyPayment] Sending error response to client:', {
            statusCode,
            message: errorMessage,
            isAuthError
        });
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            requiresAuth: isAuthError,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * @desc    Check if a user has made a payment today
 * @route   GET /api/payments/has-paid-today/:userId
 * @access  Private (requires authentication)
 */
export const hasPaidToday = async (req, res) => {
    try {
        const { userId } = req.params;
        const authUserId = req.user?._id?.toString();
        const qrCodeToken = req.user?.qrCodeToken;

        console.log({ authUserId, userId, qrCodeToken })
        
        // Verify user is authenticated
        if (!authUserId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
            });
        }

        // Verify user is authorized to check this user's payment status
        if (authUserId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to check payment status for this user',
            });
        }

        if (!qrCodeToken) {
            return res.status(400).json({
                success: false,
                message: 'User does not have a valid QR code token',
            });
        }

        const checkPaymentStatus = async () => {
            if (!req.user?._id) {
                console.error('No user ID available');
                throw new Error('User not authenticated');
            }
            
            console.log('Checking payment status for user ID:', req.user._id);
            try {
                const result = await hasPaidTodayService(userId, qrCodeToken);
                console.log('Payment status result:', result);
                return result;
            } catch (error) {
                console.error('Error checking if user has paid today:', error);
                throw error;
            }
        };

        const result = await checkPaymentStatus();
        
        res.status(200).json({
            success: true,
            hasPaidToday: result.hasPaidToday,
            lastPayment: result.lastPayment,
            message: result.message || (result.hasPaidToday ? 'Payment found for today' : 'No payment found for today')
        });
        
    } catch (error) {
        console.error('Error checking if user has paid today:', error);
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Failed to check payment status',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * @desc    Get payment history for the authenticated user
 * @route   GET /api/payments/history
 * @access  Private (user can only access their own payment history)
 */
export const getPaymentHistory = async (req, res) => {
    console.log("history request>>>>>", { user: req.user });
    try {
        // Get user from JWT token (already verified by auth middleware)
        const userId = req.user?._id;
        const qrCodeToken = req.user?.qrCodeToken;

        console.log("userId", userId);
        console.log("qrCodeToken", qrCodeToken);
        
        // Validate authentication
        if (!userId || !qrCodeToken) {
            console.error('Missing user ID or QR code token in JWT');
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }
        
        // Get pagination and sorting parameters from query
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const sortBy = req.query.sortBy || '-createdAt';
        
        // Validate sort field to prevent NoSQL injection
        const validSortFields = ['createdAt', 'amount', 'status', 'paymentMethod'];
        const sortField = sortBy.replace(/^-/, '');
        if (!validSortFields.includes(sortField)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid sort field. Valid fields are: ' + validSortFields.join(', '),
            });
        }

        // Call the payment history service with the validated parameters
        const result = await getPaymentHistoryService(
            userId, 
            qrCodeToken,
            { 
                page,
                limit,
                sortBy
            }
        );

        console.log('Payment history retrieved successfully:', {
            userId: userId,
            count: result.data?.length,
            page,
            limit,
            totalPages: result.totalPages
        });
        
        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(400).json({
            success: false,
            message: 'Failed to fetch payment history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


