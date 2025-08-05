import request from 'supertest';
import { expect } from 'chai';
import mongoose from 'mongoose';
import createApp from '../../src/app/app.js';
import User from '../../src/models/User.js';

// Increase the default Mocha timeout to 2 minutes
const TEST_TIMEOUT = 120000; // 2 minutes

describe('Authentication API', function() {
    // Set timeout for all tests in this suite
    this.timeout(TEST_TIMEOUT);
    
    let app;

    // Test user data
    const testUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
    };

    // Set up app before all tests
    before(async function() {
        this.timeout(30000); // 30 second timeout for setup
        try {
            app = await createApp();
            console.log('Express app initialized');
        } catch (error) {
            console.error('Failed to initialize Express app:', error);
            throw error;
        }
    });

    // Clean up before each test
    beforeEach(async function() {
        this.timeout(30000); // 30 second timeout for setup
        try {
            // Ensure we're connected to the database
            if (mongoose.connection.readyState === 0) {
                console.log('Not connected to database, waiting for connection...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            if (mongoose.connection.readyState === 1) { // 1 = connected
                await User.deleteMany({}).exec();
                console.log('Test data cleared');
            } else {
                console.warn('Mongoose not connected, skipping test data cleanup');
            }
        } catch (e) {
            console.error('Failed to clear test data before test:', e);
            throw e;
        }
    });

    describe('POST /api/users/register', () => {
        it('should register a new user', async () => {
            const res = await request(app)
                .post('/api/users/register')
                .send(testUser);

            expect(res.status).to.equal(201);
            expect(res.body).to.have.property('_id');
            expect(res.body).to.have.property('username', testUser.username);
            expect(res.body).to.have.property('email', testUser.email);
            expect(res.body).to.have.property('token');
            expect(res.body).to.not.have.property('password');
        });

        it('should not register a user with duplicate email', async () => {
            // First, register a user
            await request(app)
                .post('/api/users/register')
                .send(testUser);

            // Try to register with the same email
            const duplicateUser = {
                username: 'anotheruser',
                email: testUser.email, // Same email as testUser
                password: 'password123'
            };

            const res = await request(app)
                .post('/api/users/register')
                .send(duplicateUser);

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('message', 'User with this email or username already exists');
        });

        it('should not register a user with duplicate username', async () => {
            // First, register a user
            await request(app)
                .post('/api/users/register')
                .send(testUser);

            // Try to register with the same username
            const duplicateUser = {
                username: testUser.username, // Same username as testUser
                email: 'another@example.com',
                password: 'password123'
            };

            const res = await request(app)
                .post('/api/users/register')
                .send(duplicateUser);

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('message', 'User with this email or username already exists');
        });
    });

    describe('POST /api/users/login', () => {
        it('should login an existing user with correct credentials', async () => {
            // Register a test user before the login test
            await request(app)
                .post('/api/users/register')
                .send(testUser);

            const credentials = {
                email: testUser.email,
                password: testUser.password
            };

            const res = await request(app)
                .post('/api/users/login')
                .send(credentials);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('token');
            expect(res.body).to.have.property('username', testUser.username);
        });

        it('should not login with incorrect password', async () => {
            const credentials = {
                email: testUser.email,
                password: 'wrongpassword'
            };

            const res = await request(app)
                .post('/api/users/login')
                .send(credentials);

            expect(res.status).to.equal(401);
            expect(res.body).to.have.property('message', 'Invalid email or password');
        });

        it('should not login with non-existent email', async () => {
            const credentials = {
                email: 'nonexistent@example.com',
                password: 'password123'
            };

            const res = await request(app)
                .post('/api/users/login')
                .send(credentials);

            expect(res.status).to.equal(401);
            expect(res.body).to.have.property('message', 'Invalid email or password');
        });
    });

    describe('QR Code Functionality', () => {
        let registeredUser;
        let qrToken;

        before(async () => {
            // Register a test user
            const res = await request(app)
                .post('/api/users/register')
                .send({
                    username: 'qrusertest',
                    email: 'qrtest@example.com',
                    password: 'password123'
                });
            
            registeredUser = res.body;
            
            // Get the user with the QR code token
            const user = await User.findOne({ email: 'qrtest@example.com' });
            qrToken = user.qrCodeToken;
            console.log('QR Token for test:', qrToken);
        });

        it('should return user data for a valid QR code token', async () => {
            if (!qrToken) {
                this.skip(); // Skip if no QR token was extracted
            }

            const res = await request(app)
                .get(`/api/users/qr/${qrToken}`)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body).to.have.property('_id', registeredUser._id);
            expect(res.body).to.have.property('username', 'qrusertest');
            expect(res.body).to.have.property('email', 'qrtest@example.com');
            expect(res.body).to.have.property('qrCodeDataUrl').that.is.a('string');
        });

        it('should return 404 for an invalid QR code token', async () => {
            const invalidToken = 'invalid-qr-token-123';
            
            const res = await request(app)
                .get(`/api/users/qr/${invalidToken}`)
                .expect('Content-Type', /json/)
                .expect(404);

            expect(res.body).to.have.property('message', 'User not found with this QR code');
        });
    });

    describe('Protected Routes', () => {
        let authToken;
        let testUserId;
        let testUsers = [];

        before(async function() {
            this.timeout(10000); // Increase timeout for setup
            
            // Clear existing users to ensure a clean state
            await User.deleteMany({});

            // Register a test user
            const registerRes = await request(app)
                .post('/api/users/register')
                .send({
                    username: 'protectedtestuser',
                    email: 'protected@example.com',
                    password: 'password123'
                });
            
            authToken = registerRes.body.token;
            testUserId = registerRes.body._id;

            // Create some additional test users for the getUsers test
            await User.create([
                {
                    username: 'testuser1',
                    email: 'test1@example.com',
                    password: 'password123'
                },
                {
                    username: 'testuser2',
                    email: 'test2@example.com',
                    password: 'password123'
                }
            ]);
        });

        it('should access protected route with valid token', async function() {
            this.timeout(10000);
            
            // First, verify we have a valid token
            if (!authToken) {
                throw new Error('No auth token available for test');
            }
            
            console.log('Using token for test:', authToken.substring(0, 20) + '...');
            
            const res = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${authToken}`);

            console.log('Response status:', res.status);
            console.log('Response body:', JSON.stringify(res.body, null, 2));
            
            expect(res.status).to.equal(200);
            expect(res.body).to.be.an('array');
            // We expect at least the test users we just created
            expect(res.body.length).to.be.at.least(1);
        });

        it('should get user by ID with valid token', async function() {
            this.timeout(10000);
            
            if (!testUserId) {
                throw new Error('No test user ID available');
            }
            
            console.log('Testing get user by ID:', testUserId);
            
            const res = await request(app)
                .get(`/api/users/${testUserId}`)
                .set('Authorization', `Bearer ${authToken}`);
                
            console.log('User response:', JSON.stringify(res.body, null, 2));

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('_id');
            expect(res.body._id).to.equal(testUserId);
            expect(res.body).to.have.property('username', 'protectedtestuser');
            expect(res.body).to.have.property('email', 'protected@example.com');
            expect(res.body).to.not.have.property('password');
        });

        it('should not access protected route without token', async () => {
            const res = await request(app)
                .get('/api/users')
                .expect('Content-Type', /json/)
                .expect(401);

            expect(res.body).to.have.property('message', 'Not authorized, no token provided');
        });

        it('should not access protected route with invalid token', async () => {
            const res = await request(app)
                .get('/api/users')
                .set('Authorization', 'Bearer invalidtoken123')
                .expect('Content-Type', /json/)
                .expect(401);

            expect(res.body).to.have.property('message', 'Not authorized, invalid token');
        });
    });
});
