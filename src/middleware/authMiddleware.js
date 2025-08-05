import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Middleware to protect routes that require authentication
 * Verifies JWT token from cookies or Authorization header and attaches user to the request object
 */
const protect = async (req, res, next) => {
    let token;
    let tokenSource = 'none';
    
    // Log all headers for debugging (be careful with this in production)
    console.log('Request headers:', {
        ...req.headers,
        authorization: req.headers.authorization ? 'Bearer [REDACTED]' : undefined,
        cookie: req.headers.cookie ? 'Cookie [REDACTED]' : undefined
    });
    
    // 1. First try to get token from cookies
    if (req.cookies?.token) {
        token = req.cookies.token;
        tokenSource = 'cookie';
        console.log('🔑 Token found in cookies');
    } 
    // 2. Then try to get token from Authorization header
    else if (req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
        tokenSource = 'authorization_header';
        console.log('🔑 Token found in Authorization header');
    }
    // 3. Check for x-use-cookie-auth header
    else if (req.headers['x-use-cookie-auth'] === 'true' && req.cookies) {
        // If using cookie-based auth but no token in cookies, try to use session
        console.log('🔑 Using cookie-based authentication');
        // Continue without token, will be handled by session
    }

    console.log(`🔑 Token source: ${tokenSource}, token present: ${!!token}`);
    
    // If no token and not using cookie-based auth, return error
    if (!token && req.headers['x-use-cookie-auth'] !== 'true') {
        console.error('❌ No authentication token provided and not using cookie-based auth');
        return res.status(401).json({ 
            success: false,
            message: 'Not authorized, no authentication token provided',
            requiresAuth: true
        });
    }
    
    // If we have a token, verify it
    if (token) {
        // Ensure token is a string and not empty
        if (typeof token !== 'string' || !token.trim()) {
            console.error('❌ Invalid token format:', token);
            return res.status(401).json({
                success: false,
                message: 'Not authorized, invalid token format',
                requiresAuth: true
            });
        }
        
        try {
            console.log('🔍 Verifying token...');
            
            // Log the token for debugging
            console.log('🔐 Token to verify:', token);
            console.log('🔑 JWT Secret being used:', process.env.JWT_SECRET ? '*** (set)' : 'Using fallback secret');
            
            // First, decode without verification to see the content
            const unverified = jwt.decode(token, { complete: true });
            console.log('🔍 Unverified token header:', unverified?.header);
            console.log('🔍 Unverified token payload:', unverified?.payload);
            
            // Now verify the token with all possible claims
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', {
                issuer: 'easypass-api',
                audience: 'easypass-client',
                ignoreExpiration: false,
                ignoreNotBefore: false,
                algorithms: ['HS256']
            });
            
            // Log the decoded token for debugging
            console.log('✅ Token verified successfully:', {
                userId: decoded.id || decoded.userId || decoded.sub,
                iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : null,
                exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
                issuer: decoded.iss,
                audience: decoded.aud,
                allClaims: JSON.stringify(decoded, null, 2)
            });
            
            // Get user from the token
            const user = await User.findById(decoded.id || decoded.userId || decoded.sub).select('-password');
            
            if (!user) {
                console.error(' User not found for token:', decoded.id || decoded.userId || decoded.sub);
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized, user not found',
                    requiresAuth: true
                });
            }
            
            // Check if user account is active
            if (user.isSuspended || user.isDeleted) {
                console.error(' User account is not active:', user._id);
                return res.status(403).json({
                    success: false,
                    message: 'Your account has been deactivated',
                    requiresAuth: true
                });
            }
            
            // Attach user to request object
            req.user = user;
            console.log(` User authenticated: ${user._id} (${user.email})`);
            return next();
            
        } catch (error) {
            console.error(' Token verification failed:', error.message);
            
            // Handle different JWT errors
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Session expired, please log in again',
                    requiresAuth: true
                });
            }
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized, invalid token',
                    requiresAuth: true
                });
            }
            
            // For other errors
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
                error: error.message,
                requiresAuth: true
            });
        }
    } 
    
    // If using cookie-based auth but no token
    if (req.headers['x-use-cookie-auth'] === 'true') {
        try {
            if (!req.session || !req.session.userId) {
                console.log(' No active session found for cookie-based auth');
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized, no active session',
                    requiresAuth: true
                });
            }
            
            // Get user from session
            const user = await User.findById(req.session.userId).select('-password');
            
            if (!user) {
                console.error(' User not found in session:', req.session.userId);
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized, user not found',
                    requiresAuth: true
                });
            }
            
            // Check if user account is active
            if (user.isSuspended || user.isDeleted) {
                console.error(' User account is not active:', user._id);
                return res.status(403).json({
                    success: false,
                    message: 'Your account has been deactivated',
                    requiresAuth: true
                });
            }
            
            // Attach user to request object
            req.user = user;
            console.log(` User authenticated via session: ${user._id} (${user.email})`);
            return next();
            
        } catch (error) {
            console.error(' Session authentication failed:', error);
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
                error: error.message,
                requiresAuth: true
            });
        }
    }
    
    // This should not happen due to previous checks, but just in case
    console.error(' No valid authentication method found');
    return res.status(401).json({
        success: false,
        message: 'Not authorized, no valid authentication method',
        requiresAuth: true
    });
};

export { protect };
