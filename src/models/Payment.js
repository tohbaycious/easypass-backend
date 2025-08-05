import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    // Reference to the user who made the payment
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Link to the user's qrCodeToken for quick lookups
    qrCodeToken: {
        type: String,
        required: true,
        index: true
    },
    // Payment details
    paymentId: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'NGN'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        required: true
    },
    description: String,
    metadata: {
        type: Map,
        of: String,
        default: {}
    },
    // Payment type (one-time, etc.)
    paymentType: {
        type: String,
        default: 'one-time',
        enum: ['one-time']
    },
    // Timestamps
    paidAt: {
        type: Date,
        default: Date.now
    },
    // Additional timestamps for tracking payment lifecycle
    processedAt: Date,
    refundedAt: Date,
    failedAt: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for common queries
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ qrCodeToken: 1, status: 1 });

// Virtual for checking if the payment is active
paymentSchema.virtual('isActive').get(function() {
    return this.status === 'completed';
});

// Pre-save hook to ensure qrCodeToken is always in sync with user
paymentSchema.pre('save', async function(next) {
    if (this.isNew && !this.qrCodeToken) {
        try {
            const User = mongoose.model('User');
            const user = await User.findById(this.user);
            if (user && user.qrCodeToken) {
                this.qrCodeToken = user.qrCodeToken;
            }
        } catch (error) {
            return next(error);
        }
    }
    next();
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
