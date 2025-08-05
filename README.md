# EasyPass Backend

This is the backend service for the EasyPass application, built with Node.js, Express, and MongoDB.

## Features

- User authentication and authorization
- Payment processing and verification
- QR code generation and validation
- RESTful API endpoints
- Repository pattern for data access

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/easypass
   JWT_SECRET=your_jwt_secret_here
   PAYSTACK_SECRET_KEY=your_paystack_secret_key
   REPOSITORY_TYPE=mongodb # or 'mongoose'
   ```

### Running the Application

```bash
# Development
npm run dev

# Production
npm start

# Run tests
npm test
```

## Repository Pattern

The backend uses the repository pattern to abstract data access. This provides several benefits:

- Decouples business logic from data access
- Makes the code more testable
- Allows switching between different data access implementations
- Centralizes data access logic

### Available Repositories

- **UserRepository**: Handles user data operations
- **PaymentRepository**: Manages payment transactions

### Configuration

You can switch between MongoDB driver and Mongoose implementations using the `REPOSITORY_TYPE` environment variable:

```env
REPOSITORY_TYPE=mongodb  # or 'mongoose'
```

### Documentation

For detailed documentation on the repository pattern implementation, see [REPOSITORY_PATTERN.md](REPOSITORY_PATTERN.md).

## API Documentation

API documentation is available at `/api-docs` when running in development mode.

## Testing

Run the test suite:

```bash
npm test

# Run specific test file
npm test test/integration/userRoutes.test.js
```

## Deployment

1. Set `NODE_ENV=production` in your environment variables
2. Ensure all required environment variables are set
3. Use a process manager like PM2 to keep the application running

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
