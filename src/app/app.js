import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import userRoutes from '../routes/userRoutes.js';
import paymentRoutes from '../routes/paymentRoutes.js';
import { notFoundHandler, globalErrorHandler } from '../middleware/errorHandler.js';
import connectDB from '../config/db.js';

const createApp = async () => {
    const app = express();

    // Connect to MongoDB
    await connectDB();

    // Middleware
    // CORS configuration
    const corsOptions = {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps, curl, postman)
            if (!origin) return callback(null, true);
            
            const allowedOrigins = [
                'http://localhost:5173',
                'http://127.0.0.1:5173',
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                process.env.FRONTEND_URL
            ].filter(Boolean);
            
            // Check if the origin is allowed
            if (process.env.NODE_ENV === 'development' || allowedOrigins.some(allowedOrigin => 
                origin === allowedOrigin || 
                origin.startsWith(`http://${allowedOrigin}`) || 
                origin.startsWith(`https://${allowedOrigin}`)
            )) {
                // Important: For credentials, we must return the specific origin
                // rather than true to avoid the wildcard ('*') behavior
                callback(null, origin);
            } else {
                console.warn('CORS blocked request from origin:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-User-Id',
            'X-QR-Code-Token',
            'X-QR-Token',
            'X-Use-Cookie-Auth',
            'Cache-Control',
            'Pragma',
            'Expires',
            'If-Modified-Since',
            'If-None-Match',
            'Cache-Control',
            'Pragma',
            'Expires',
            'If-Modified-Since',
            'If-None-Match'
        ],
        credentials: true,
        exposedHeaders: [
            'Content-Length',
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-User-Id',
            'X-QR-Token',
            'X-Use-Cookie-Auth'
        ],
        maxAge: 86400, // 24 hours
        exposedHeaders: [
            'set-cookie',
            'access-control-allow-credentials',
            'access-control-allow-origin',
            'access-control-allow-headers'
        ],
        maxAge: 86400 // 24 hours
    };
    
    // Enable CORS with options
    app.use(cors(corsOptions));
    
    // Handle preflight requests
    app.options('*', cors(corsOptions));
    
    // Body parsers
    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: true, limit: '10kb' }));
    
    // Cookie parser
    app.use(cookieParser());

    // Request logger for development
    if (process.env.NODE_ENV === 'development') {
        app.use((req, res, next) => {
            console.log(`${req.method} ${req.originalUrl}`);
            next();
        });
    }

    // API Routes
    app.use('/api/users', userRoutes);
    app.use('/api/payments', paymentRoutes);

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.status(200).json({ 
            status: 'UP',
            database: 'Connected',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version
        });
    });

    // Handle 404 - Must be after all other routes
    app.all('*', notFoundHandler);

    // Global error handler - Must be after all other middleware and routes
    app.use(globalErrorHandler);

    app.listen(process.env.PORT || 3000, () => {
        console.log(`Server running on port ${process.env.PORT || 3000}`);
    });

    return app;
};

export default createApp;
