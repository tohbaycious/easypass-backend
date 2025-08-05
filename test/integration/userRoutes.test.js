import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../src/app.js';
import { getUserRepository } from '../../src/repositories/repositoryFactory.js';

let mongoServer;
let userRepository;

// Test user data
const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123',
  qrCodeToken: 'testqrcodetoken123',
  qrCodeDataUrl: 'data:testqrcode'
};

// Admin test user
const adminUser = {
  username: 'admin',
  email: 'admin@example.com',
  password: 'admin123',
  isAdmin: true,
  qrCodeToken: 'adminqrcodetoken123',
  qrCodeDataUrl: 'data:adminqrcode'
};

describe('User Routes', () => {
  beforeAll(async () => {
    // Start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to the in-memory database
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    // Get repository instance
    userRepository = getUserRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all test data before each test
    await userRepository.deleteMany({});
  });

  describe('POST /api/users/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          username: testUser.username,
          email: testUser.email,
          password: testUser.password
        });
      
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('username', testUser.username);
      expect(res.body).toHaveProperty('email', testUser.email);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('qrCodeDataUrl');
      expect(res.body).not.toHaveProperty('password');
    });

    it('should not register a user with duplicate email', async () => {
      // First registration
      await request(app)
        .post('/api/users/register')
        .send({
          username: testUser.username,
          email: testUser.email,
          password: testUser.password
        });
      
      // Second registration with same email
      const res = await request(app)
        .post('/api/users/register')
        .send({
          username: 'anotheruser',
          email: testUser.email,
          password: 'anotherpassword'
        });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('POST /api/users/login', () => {
    beforeEach(async () => {
      // Create a test user
      await userRepository.create({
        ...testUser,
        password: await bcrypt.hash(testUser.password, 10)
      });
    });

    it('should authenticate a user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('email', testUser.email);
    });

    it('should not authenticate with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        });
      
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Invalid email or password');
    });
  });

  describe('GET /api/users', () => {
    let adminToken;
    
    beforeEach(async () => {
      // Create admin user and get token
      const hashedPassword = await bcrypt.hash(adminUser.password, 10);
      const createdAdmin = await userRepository.create({
        ...adminUser,
        password: hashedPassword
      });
      
      // Login to get token
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          email: adminUser.email,
          password: adminUser.password
        });
      
      adminToken = loginRes.body.token;
      
      // Create some test users
      await userRepository.create({
        username: 'user1',
        email: 'user1@example.com',
        password: await bcrypt.hash('password1', 10)
      });
      
      await userRepository.create({
        username: 'user2',
        email: 'user2@example.com',
        password: await bcrypt.hash('password2', 10)
      });
    });

    it('should get all users (admin only)', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3); // admin + 2 test users
      
      // Check that passwords are not included in the response
      res.body.forEach(user => {
        expect(user).not.toHaveProperty('password');
      });
    });

    it('should return 401 for non-admin users', async () => {
      // Create a regular user and get their token
      const userRes = await request(app)
        .post('/api/users/register')
        .send({
          username: 'regularuser',
          email: 'regular@example.com',
          password: 'password123'
        });
      
      const regularToken = userRes.body.token;
      
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${regularToken}`);
      
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('GET /api/users/:id', () => {
    let testUserId;
    let userToken;
    
    beforeEach(async () => {
      // Create a test user and get their token
      const hashedPassword = await bcrypt.hash(testUser.password, 10);
      const createdUser = await userRepository.create({
        ...testUser,
        password: hashedPassword
      });
      
      testUserId = createdUser._id;
      
      // Login to get token
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      
      userToken = loginRes.body.token;
    });

    it('should get user by ID', async () => {
      const res = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('_id', testUserId.toString());
      expect(res.body).toHaveProperty('email', testUser.email);
      expect(res.body).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('GET /api/users/qr/:token', () => {
    beforeEach(async () => {
      // Create a test user with a QR code token
      await userRepository.create({
        ...testUser,
        password: await bcrypt.hash(testUser.password, 10)
      });
    });

    it('should get user by QR code token', async () => {
      const res = await request(app)
        .get(`/api/users/qr/${testUser.qrCodeToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('qrCodeToken', testUser.qrCodeToken);
      expect(res.body).not.toHaveProperty('password');
    });

    it('should return 404 for invalid QR code token', async () => {
      const res = await request(app)
        .get('/api/users/qr/invalidtoken123');
      
      expect(res.statusCode).toEqual(404);
    });
  });
});
