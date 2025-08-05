import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import { getUserRepository, getPaymentRepository } from '../../src/repositories/repositoryFactory.js';
import bcrypt from 'bcryptjs';

let mongoServer;
let userRepository;
let paymentRepository;

// Test user data
const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123',
  qrCodeToken: 'testqrcodetoken123',
  qrCodeDataUrl: 'data:testqrcode'
};

// Test payment data
const testPayment = {
  user: null, // Will be set in beforeEach
  qrCodeToken: 'testqrcodetoken123',
  reference: 'test_ref_123',
  amount: 5000, // 5000 kobo = 50 NGN
  currency: 'NGN',
  status: 'completed',
  paymentMethod: 'card',
  description: 'Test payment',
  paidAt: new Date()
};

describe('Payment Routes', () => {
  beforeAll(async () => {
    // Start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to the in-memory database
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    // Get repository instances
    userRepository = getUserRepository();
    paymentRepository = getPaymentRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all test data before each test
    await userRepository.deleteMany({});
    await paymentRepository.deleteMany({});
    
    // Create a test user
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    const createdUser = await userRepository.create({
      ...testUser,
      password: hashedPassword
    });
    
    // Set the user ID for test payments
    testPayment.user = createdUser._id;
    
    // Create a test payment
    await paymentRepository.create(testPayment);
  });

  // Helper function to get auth token
  const getAuthToken = async () => {
    const loginRes = await request(app)
      .post('/api/users/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    return loginRes.body.token;
  };

  describe('POST /api/payments/verify', () => {
    it('should verify a payment with a valid reference', async () => {
      const token = await getAuthToken();
      
      // Mock Paystack verification response
      const mockPaystackResponse = {
        data: {
          status: 'success',
          message: 'Verification successful',
          data: {
            id: 12345,
            reference: 'test_ref_456',
            amount: 5000,
            currency: 'NGN',
            status: 'success',
            channel: 'card',
            paid_at: new Date().toISOString(),
            metadata: {
              userId: testPayment.user.toString()
            }
          }
        }
      };
      
      // Mock the Paystack API call
      jest.spyOn(require('axios'), 'get').mockResolvedValueOnce(mockPaystackResponse);
      
      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reference: 'test_ref_456'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'Payment verified successfully');
      expect(res.body.data.payment).toHaveProperty('status', 'completed');
    });

    it('should return 400 for invalid reference', async () => {
      const token = await getAuthToken();
      
      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reference: 'invalid_reference'
        });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/payments/has-paid-today', () => {
    it('should check if user has paid today (using user ID)', async () => {
      const token = await getAuthToken();
      
      const res = await request(app)
        .get(`/api/payments/has-paid-today?userId=${testPayment.user}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('hasPaidToday', true);
      expect(res.body.data).toHaveProperty('lastPayment');
    });

    it('should check if user has paid today (using QR code token)', async () => {
      const token = await getAuthToken();
      
      const res = await request(app)
        .get(`/api/payments/has-paid-today?qrCodeToken=${testUser.qrCodeToken}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('hasPaidToday', true);
    });

    it('should return 400 if neither user ID nor QR code token is provided', async () => {
      const token = await getAuthToken();
      
      const res = await request(app)
        .get('/api/payments/has-paid-today')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/payments/history', () => {
    it('should get payment history for a user', async () => {
      const token = await getAuthToken();
      
      // Create additional test payments
      for (let i = 0; i < 5; i++) {
        await paymentRepository.create({
          ...testPayment,
          reference: `test_ref_${i}`,
          amount: 1000 * (i + 1),
          paidAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000) // Payments from different days
        });
      }
      
      const res = await request(app)
        .get('/api/payments/history')
        .query({ userId: testPayment.user })
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(Array.isArray(res.body.data.payments)).toBe(true);
      expect(res.body.data.payments.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toHaveProperty('total');
      expect(res.body.data.pagination).toHaveProperty('page', 1);
    });

    it('should support pagination', async () => {
      const token = await getAuthToken();
      
      // Create additional test payments
      for (let i = 0; i < 15; i++) {
        await paymentRepository.create({
          ...testPayment,
          reference: `test_pagination_${i}`,
          amount: 1000 * (i + 1),
          paidAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        });
      }
      
      // First page
      const page1 = await request(app)
        .get('/api/payments/history')
        .query({ 
          userId: testPayment.user,
          page: 1,
          limit: 5
        })
        .set('Authorization', `Bearer ${token}`);
      
      expect(page1.statusCode).toEqual(200);
      expect(page1.body.data.payments.length).toBe(5);
      expect(page1.body.data.pagination).toHaveProperty('page', 1);
      expect(page1.body.data.pagination).toHaveProperty('limit', 5);
      
      // Second page
      const page2 = await request(app)
        .get('/api/payments/history')
        .query({ 
          userId: testPayment.user,
          page: 2,
          limit: 5
        })
        .set('Authorization', `Bearer ${token}`);
      
      expect(page2.statusCode).toEqual(200);
      expect(page2.body.data.payments.length).toBeGreaterThan(0);
      expect(page2.body.data.pagination).toHaveProperty('page', 2);
    });
  });

  describe('GET /api/payments/:id', () => {
    it('should get a payment by ID', async () => {
      const token = await getAuthToken();
      
      // Create a test payment
      const payment = await paymentRepository.create({
        ...testPayment,
        reference: 'test_single_payment'
      });
      
      const res = await request(app)
        .get(`/api/payments/${payment._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('_id', payment._id.toString());
      expect(res.body.data).toHaveProperty('reference', 'test_single_payment');
    });

    it('should return 404 for non-existent payment', async () => {
      const token = await getAuthToken();
      const nonExistentId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .get(`/api/payments/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/payments/simulate', () => {
    it('should simulate a payment (development only)', async () => {
      // This test will only run in development environment
      if (process.env.NODE_ENV === 'production') {
        return;
      }
      
      const token = await getAuthToken();
      
      const res = await request(app)
        .post('/api/payments/simulate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 2500,
          userId: testPayment.user,
          description: 'Test simulation'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('payment');
      expect(res.body.data.payment).toHaveProperty('status', 'completed');
    });
  });
});
