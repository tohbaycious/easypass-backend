import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import Payment from '../models/Payment.js';
import User from '../models/User.js';

/**
 * Process a payment and update user's payment information
 * @param {string} userId - The ID of the user making the payment
 * @param {Object} paymentData - The payment data
 * @param {number} paymentData.amount - The payment amount in smallest currency unit (e.g., cents)
 * @param {string} [paymentData.currency='USD'] - The currency code (default: 'USD')
 * @param {string} [paymentData.paymentMethod] - The payment method used
 * @param {string} [paymentData.description] - Description of the payment
 * @param {Object} [paymentData.metadata] - Additional metadata for the payment
 * @returns {Promise<Object>} The payment and updated user information
 */
const processPayment = async (userId, paymentData) => {
    try {
        // Get user to ensure they exist and get qrCodeToken
        const user = await User.findById(userId);
        
        if (!user) {
            throw new Error('User not found');
        }

        // Create payment record
        const payment = new Payment({
            user: userId,
            qrCodeToken: user.qrCodeToken,
            paymentId: `pay_${Date.now()}`,
            amount: paymentData.amount,
            currency: paymentData.currency || 'USD',
            status: 'pending',
            paymentMethod: paymentData.paymentMethod || 'card',
            description: paymentData.description || 'Payment for services',
            metadata: paymentData.metadata || {}
        });

        // Save payment record
        const savedPayment = await payment.save();
        
        // Update user's last payment date and status
        user.lastPaymentDate = new Date();
        user.paymentStatus = 'pending';
        await user.save();
        
        return {
            paymentId: savedPayment.paymentId,
            userId: userId,
            amount: savedPayment.amount,
            currency: savedPayment.currency,
            status: savedPayment.status,
            paymentMethod: savedPayment.paymentMethod,
            description: savedPayment.description,
            processedAt: savedPayment.processedAt
        };
    } catch (error) {
        console.error('Error processing payment:', error);
        throw new Error(`Payment processing failed: ${error.message}`);
    }
};

/**
 * Handle payment webhook from payment provider
 * @param {Object} webhookData - The webhook payload from the payment provider
 * @returns {Promise<Object>} The result of processing the webhook
 */
const handlePaymentWebhook = async (webhookData) => {
    try {
        // Verify the webhook data (implementation depends on your payment provider)
        const { event, data } = webhookData;
        
        if (event === 'charge.success') {
            const { reference, amount, customer } = data;
            
            // Find and update the payment by reference
            const payment = await Payment.findOneAndUpdate(
                { paymentId: reference },
                {
                    status: 'completed',
                    paidAt: new Date(),
                    updatedAt: new Date()
                },
                { new: true }
            );

            if (payment) {
                // Update user's payment status
                await User.findByIdAndUpdate(payment.user, {
                    'payment.status': 'active',
                    'payment.lastPaymentDate': new Date(),
                    'payment.lastPaymentAmount': payment.amount,
                    'payment.currency': payment.currency,
                    updatedAt: new Date()
                });
                
                return {
                    success: true,
                    message: 'Payment processed successfully',
                    payment: {
                        id: payment._id,
                        paymentId: payment.paymentId,
                        amount: payment.amount,
                        currency: payment.currency,
                        status: 'completed',
                        paidAt: payment.paidAt
                    }
                };
            }
            
            throw new Error('Payment not found');
        }
        
        throw new Error(`Unhandled webhook event: ${event}`);
    } catch (error) {
        console.error('Error processing webhook:', error);
        throw new Error(`Webhook processing failed: ${error.message}`);
    }
};

/**
 * Get a payment by ID with user and QR code token validation
 * @param {string} paymentId - The ID of the payment to retrieve
 * @param {string} userId - The ID of the user making the request
 * @param {string} qrCodeToken - The QR code token of the user
 * @returns {Promise<Object>} The payment details if found and authorized
 */
const getPaymentByIdService = async (paymentId, userId, qrCodeToken) => {
    try {
        // Find the payment and verify user access
        const payment = await Payment.findOne({
            _id: paymentId,
            $or: [
                { user: userId },
                { qrCodeToken: qrCodeToken }
            ]
        }).populate('user', '-password -qrCodeToken');

        if (!payment) {
            const error = new Error('Payment not found or access denied');
            error.statusCode = 404;
            throw error;
        }

        return payment.toObject();
    } catch (error) {
        if (error.name === 'CastError' && error.kind === 'ObjectId') {
            const err = new Error('Invalid payment ID format');
            err.statusCode = 400;
            throw err;
        }
        console.error('Error getting payment by ID:', error);
        throw error;
    }
};

/**
 * Get payment history for a user with pagination
 * @param {string} userId - The ID of the user
 * @param {string} qrCodeToken - The QR code token of the user
 * @param {Object} options - Query options
 * @param {number} [options.limit=10] - Number of records per page
 * @param {number} [options.page=1] - Page number
 * @param {string} [options.sortBy='-createdAt'] - Sort field and order (- for descending)
 * @returns {Promise<Object>} Paginated payment history
 */
const getPaymentHistoryService = async (userId, qrCodeToken, { 
    limit = 10, 
    page = 1, 
    sortBy = '-createdAt' 
} = {}) => {
    try {
        // Validate user exists and qrCodeToken matches
        const user = await User.findOne({
            _id: userId,
            qrCodeToken: qrCodeToken
        });
        
        if (!user) {
            throw new Error('User not found or invalid QR code token');
        }

        // Calculate pagination values
        const skip = (page - 1) * limit;
        
        // Parse sort field and direction
        const sort = {};
        if (sortBy.startsWith('-')) {
            sort[sortBy.substring(1)] = -1;
        } else {
            sort[sortBy] = 1;
        }

        // Build query
        const query = { 
            user: userId,
            qrCodeToken: qrCodeToken
        };

        // Get total count for pagination
        const total = await Payment.countDocuments(query);
        
        // Get paginated results
        const payments = await Payment.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        return {
            success: true,
            data: payments,
            pagination: {
                total,
                totalPages,
                currentPage: page,
                hasNextPage,
                hasPreviousPage,
                limit
            }
        };
    } catch (error) {
        console.error('Error fetching payment history:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        if (error.name === 'CastError' && error.kind === 'ObjectId') {
            const err = new Error('Invalid user ID format');
            err.statusCode = 400;
            throw err;
        }
        
        throw error;
    }
};

/**
 * Save a verified payment to the database
 * @param {Object} paymentData - The verified payment data from Paystack
 * @param {string} paymentData.user - The user ID
 * @param {string} paymentData.reference - The payment reference
 * @param {number} paymentData.amount - The payment amount in smallest currency unit (e.g., kobo)
 * @param {string} paymentData.currency - The currency code (e.g., 'NGN')
 * @param {string} paymentData.status - The payment status
 * @param {string} paymentData.paymentMethod - The payment method used
 * @param {Object} paymentData.metadata - Additional payment metadata
 * @param {Date} paymentData.paidAt - When the payment was made
 * @returns {Promise<Object>} The saved payment document
 */
const saveVerifiedPayment = async (paymentData) => {
    const { user, reference, amount, currency, status, paymentMethod, metadata, paidAt } = paymentData;
    
    console.log('Saving verified payment:', { user, reference, amount, currency });
    
    // Find the user
    const userDoc = await User.findById(user);
    
    if (!userDoc) {
        throw new Error('User not found');
    }
    
    // Check if payment already exists
    const existingPayment = await Payment.findOne({ reference });
    if (existingPayment) {
        console.log('Payment already exists:', existingPayment._id);
        return existingPayment.toObject();
    }
    
    // Create new payment record
    const payment = new Payment({
        user: userDoc._id,
        qrCodeToken: userDoc.qrCodeToken,
        paymentId: reference,
        amount: amount,
        currency: currency || 'NGN',
        status: status || 'completed',
        paymentMethod: paymentMethod || 'card',
        description: `Payment via ${paymentMethod || 'card'}`,
        metadata: metadata || {},
        paidAt: paidAt || new Date()
    });
    
    console.log('Saving new payment record');
    
    // Save payment
    const savedPayment = await payment.save();
    
    console.log('Payment saved successfully:', savedPayment._id);
    
    // Update user's payment status
    console.log('Updating user payment status');
    await User.findByIdAndUpdate(
        userDoc._id,
        {
            'payment.status': 'active',
            'payment.lastPaymentDate': savedPayment.paidAt,
            'payment.lastPaymentAmount': savedPayment.amount,
            'payment.currency': savedPayment.currency,
            'payment.paymentType': 'one-time',
            updatedAt: new Date()
        },
        { new: true }
    );
    
    console.log('User payment status updated successfully');
    
    return savedPayment.toObject();
};

/**
 * Verify a payment with Paystack and save the transaction
 * @param {string} reference - The payment reference from Paystack
 * @param {string} userId - The ID of the user making the request
 * @returns {Promise<Object>} The verified payment data
 */
const verifyPaymentWithPaystack = async (reference, userId) => {
    console.log('🔍 [verifyPaymentWithPaystack] Starting payment verification', {
        reference,
        userId,
        timestamp: new Date().toISOString()
    });
    
    if (!reference) {
        const error = new Error('Payment reference is required');
        console.error('❌ [verifyPaymentWithPaystack] Error:', error.message);
        throw error;
    }

    try {
        
        if (!process.env.PAYSTACK_SECRET_KEY) {
            const error = new Error('Payment verification service is not properly configured');
            console.error('❌ [verifyPaymentWithPaystack] PAYSTACK_SECRET_KEY is not set in environment variables');
            throw error;
        }

        // Check if this is a test payment (reference starts with 'test_' or 'pay_')
        const isTestPayment = reference.startsWith('test_') || reference.startsWith('pay_');
        
        console.log('🔍 [verifyPaymentWithPaystack] Payment verification request details:', {
            reference,
            userId,
            isTestPayment,
            timestamp: new Date().toISOString(),
            referenceStartsWithPay: reference.startsWith('pay_'),
            referenceStartsWithTest: reference.startsWith('test_')
        });
        
        console.log('🔍 [verifyPaymentWithPaystack] isTestPayment value:', isTestPayment);
        
        let paymentData;
        
        if (isTestPayment) {
            console.log('✅ [verifyPaymentWithPaystack] Processing test payment with reference:', reference);
            
            // For test payments, create a successful payment record directly
            const user = await User.findById(userId);
            
            if (!user) {
                console.error('❌ [verifyPaymentWithPaystack] User not found for test payment');
                throw new Error('User not found');
            }
            
            console.log('✅ [verifyPaymentWithPaystack] Found user for test payment:', {
                userId: user._id,
                email: user.email,
                qrCodeToken: user.qrCodeToken ? 'present' : 'missing'
            });
            
            // Use a fixed amount for test payments (1000 = 10.00 NGN)
            const testAmount = 1000;
            
            paymentData = {
                user: userId,
                qrCodeToken: user.qrCodeToken,
                reference: reference,
                amount: testAmount / 100, // Convert to Naira
                currency: 'NGN',
                status: 'success',
                paymentMethod: 'test_card',
                paidAt: new Date(),
                metadata: {
                    isTestPayment: true,
                    verifiedAt: new Date().toISOString(),
                    testReference: reference,
                    testUserId: userId.toString()
                }
            };
            
            console.log('✅ [verifyPaymentWithPaystack] Created test payment data:', JSON.stringify(paymentData, null, 2));
            
            // Save the test payment
            try {
                const savedPayment = await saveVerifiedPayment({
                    ...paymentData,
                    // session // Pass the session to maintain transaction
                });
                
                console.log('✅ [verifyPaymentWithPaystack] Successfully saved test payment:', {
                    paymentId: savedPayment._id,
                    reference: savedPayment.reference,
                    amount: savedPayment.amount,
                    status: savedPayment.status
                });
                
                // Update user's payment information and get the updated user
                const updatedUser = await User.findByIdAndUpdate(
                    userId,
                    {
                        'payment.paymentType': 'one-time',
                        'payment.lastPaymentDate': savedPayment.paidAt,
                        'payment.lastPaymentAmount': savedPayment.amount,
                        'payment.status': 'active',
                        'payment.nextBillingDate': null,
                        updatedAt: new Date()
                    },
                    { 
                        new: true,
                        // session 
                    }
                ).select('-password -__v -resetPasswordToken -resetPasswordExpire');
                
                return {
                    success: true,
                    message: 'Test payment verified and recorded successfully',
                    payment: {
                        id: savedPayment._id,
                        reference: savedPayment.reference,
                        amount: savedPayment.amount,
                        currency: savedPayment.currency,
                        status: savedPayment.status,
                        paidAt: savedPayment.paidAt
                    },
                    user: updatedUser ? updatedUser.toObject() : null
                };
                
            } catch (saveError) {
                console.error('❌ [verifyPaymentWithPaystack] Error saving test payment:', {
                    error: saveError.message,
                    stack: saveError.stack,
                    reference,
                    userId
                });
                throw new Error(`Failed to save test payment: ${saveError.message}`);
            }
        } else {
            // For real payments, verify with Paystack
            const paystackUrl = `https://api.paystack.co/transaction/verify/${reference}`;
            console.log('Verifying payment with Paystack:', { paystackUrl });
            
            const response = await axios.get(paystackUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'EasyPass/1.0'
                },
                timeout: 30000, // 30 seconds timeout
                maxRedirects: 0, // Prevent automatic redirects
                validateStatus: (status) => status < 500 // Don't throw for 4xx errors
            });

            console.log('Paystack API response:', { status: response.status, data: response.data });

            if (response.status !== 200) {
                throw new Error(`Payment verification failed: ${response.data.message || 'Unknown error'}`);
            }

            const { data } = response.data;
            console.log('Payment verification data:', data);
            
            // Get user to associate with the payment
            const user = await User.findById(userId);      
            
            if (!user) {
                throw new Error('User not found');
            }

            // Prepare payment data for real payment
            paymentData = {
                user: userId,
                qrCodeToken: user.qrCodeToken,
                reference: data.reference,
                amount: data.amount / 100, // Convert from kobo to Naira
                currency: data.currency,
                status: data.status === 'success' ? 'completed' : data.status === 'failed' ? 'failed' : 'pending',
                paymentMethod: data.channel,
                description: `Payment via ${data.channel}`,
                metadata: {
                    // Only include primitive values that can be converted to strings
                    ...(data.metadata ? Object.fromEntries(
                        Object.entries(data.metadata).filter(([_, v]) => 
                            v === null || ['string', 'number', 'boolean'].includes(typeof v)
                        )
                    ) : {}),
                    paystackTransactionId: data.id,
                    paystackChannel: data.channel,
                    paystackReference: data.reference,
                    ipAddress: data.ip_address,
                    fees: String(data.fees / 100), // Convert to string explicitly
                    // Skip complex objects that can't be stored as strings
                    customer: data.customer ? JSON.stringify(data.customer) : undefined,
                    authorization: data.authorization ? JSON.stringify(data.authorization) : undefined
                },
                paidAt: data.paid_at ? new Date(data.paid_at) : new Date()
            };

            // Prepare payment data for saving
            const paymentToSave = {
                user: userId,
                reference: data.reference,
                amount: data.amount / 100, // Convert from kobo to Naira
                currency: data.currency,
                status: data.status === 'success' ? 'completed' : data.status === 'failed' ? 'failed' : 'pending',
                paymentMethod: data.channel,
                description: `Payment via ${data.channel}`,
                metadata: {
                    // Only include primitive values that can be converted to strings
                    ...(data.metadata ? Object.fromEntries(
                        Object.entries(data.metadata).filter(([_, v]) => 
                            v === null || ['string', 'number', 'boolean'].includes(typeof v)
                        )
                    ) : {}),
                    paystackTransactionId: data.id,
                    paystackChannel: data.channel,
                    paystackReference: data.reference,
                    ipAddress: data.ip_address,
                    fees: String(data.fees / 100), // Convert to string explicitly
                    // Skip complex objects that can't be stored as strings
                    customer: data.customer ? JSON.stringify(data.customer) : undefined,
                    authorization: data.authorization ? JSON.stringify(data.authorization) : undefined
                },
                paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
                // session // Pass the session to maintain transaction
            };
            
            console.log('Saving payment with data:', {
                reference: paymentToSave.reference,
                amount: paymentToSave.amount,
                currency: paymentToSave.currency,
                status: paymentToSave.status
            });
            
            // Save the verified payment
            const payment = await saveVerifiedPayment(paymentToSave);

            // Update user's payment information and get the updated user
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                {
                    'payment.paymentType': 'one-time',
                    'payment.lastPaymentDate': payment.paidAt,
                    'payment.lastPaymentAmount': payment.amount,
                    'payment.status': 'active',
                    'payment.nextBillingDate': null,
                    updatedAt: new Date()
                },
                { 
                    new: true,
                    // session 
                }
            ).select('-password -__v -resetPasswordToken -resetPasswordExpire');

            return {
                success: true,
                message: 'Payment verified and recorded successfully',
                payment: {
                    id: payment._id,
                    paymentId: payment.paymentId,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                    paidAt: payment.paidAt
                },
                user: updatedUser ? updatedUser.toObject() : null
            };
        }
    } catch (error) {
        console.error('Error verifying payment with Paystack:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code,
            response: error.response?.data
        });
        
        // Handle Axios errors
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            const { status, data } = error.response;
            const errorMessage = data?.message || 'Payment verification failed';
            const err = new Error(`Paystack API error (${status}): ${errorMessage}`);
            err.statusCode = status;
            err.isOperational = true;
            throw err;
        } else if (error.request) {
            // The request was made but no response was received
            const err = new Error('No response received from Paystack. Please try again later.');
            err.statusCode = 503; // Service Unavailable
            err.isOperational = true;
            throw err;
        } else {
            // For any other errors, rethrow them
            error.statusCode = error.statusCode || 500;
            error.isOperational = true;
            throw error;
        }
    } finally {
        // await session.endSession();
    }
};

/**
 * Check if user has made a payment today
 * @param {string} userId - The ID of the user
 * @param {string} qrCodeToken - The QR code token of the user
 * @returns {Promise<Object>} Object containing hasPaidToday and lastPayment info
 */
const hasPaidTodayService = async (userId, qrCodeToken) => {
    console.log('Checking if user has paid today:', { userId, qrCodeToken })
    try {
        // Validate user exists and qrCodeToken matches
        const user = await User.findOne({
            _id: userId,
            qrCodeToken: qrCodeToken
        });
        
        if (!user) {
            throw new Error('User not found or invalid QR code token');
        }

        // Get the start of today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        // Check for any successful payments today
        const todayPayment = await Payment.findOne({
            user: userId,
            status: 'completed',
            paidAt: { $gte: todayStart }
        })
        .sort({ paidAt: -1 })
        .select('_id amount currency paidAt')
        .lean();

        // Get the most recent payment regardless of date
        const lastPayment = await Payment.findOne(
            { user: userId, status: 'completed' },
            '_id amount currency paidAt',
            { sort: { paidAt: -1 } }
        ).lean();

        return {
            hasPaidToday: !!todayPayment,
            lastPayment: lastPayment ? {
                id: lastPayment._id,
                amount: lastPayment.amount,
                currency: lastPayment.currency,
                paidAt: lastPayment.paidAt
            } : null
        };
    } catch (error) {
        console.error('Error checking payment status:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        if (error.name === 'CastError' && error.kind === 'ObjectId') {
            const err = new Error('Invalid user ID format');
            err.statusCode = 400;
            throw err;
        }
        
        throw error;
    }
};

export {
    processPayment,
    handlePaymentWebhook,
    getPaymentByIdService,
    getPaymentHistoryService,
    saveVerifiedPayment,
    verifyPaymentWithPaystack,
    hasPaidTodayService
};
