# Repository Pattern Implementation

This document explains the repository pattern implementation in the EasyPass backend and how to work with it.

## Overview

The repository pattern has been implemented to abstract the data access layer from the business logic. This provides several benefits:

1. **Decoupling**: Business logic doesn't need to know about the underlying data access technology
2. **Testability**: Easy to mock repositories for unit testing
3. **Flexibility**: Can switch between different data access implementations (e.g., Mongoose, native MongoDB)
4. **Maintainability**: Centralizes data access logic

## Architecture

```
src/
  ├── controllers/         # Route handlers
  ├── repositories/        # Repository implementations
  │   ├── baseRepository.js    # Base repository interface
  │   ├── repositoryFactory.js # Factory for repository instances
  │   ├── mongodb/        # Native MongoDB implementations
  │   └── mongoose/       # Mongoose implementations
  └── services/           # Business logic layer
```

## Repository Interface

The base repository (`baseRepository.js`) defines the standard interface that all repositories must implement:

```javascript
class BaseRepository {
  async findById(id) { /* ... */ }
  async findOne(query) { /* ... */ }
  async create(data) { /* ... */ }
  async update(id, data) { /* ... */ }
  async delete(id) { /* ... */ }
  async find(query, options) { /* ... */ }
  async count(query) { /* ... */ }
}
```

## Available Repositories

### User Repository

**Methods**:
- `findByEmail(email)` - Find user by email
- `findByQrToken(qrToken)` - Find user by QR code token
- `updateUserPaymentInfo(userId, paymentInfo)` - Update user's payment information

### Payment Repository

**Methods**:
- `findPaymentsByUser(userId, options)` - Find payments by user ID
- `findPaymentsByQrToken(qrToken, options)` - Find payments by QR code token
- `hasPaidToday(userId, qrToken)` - Check if user has paid today
- `getPaymentStats(userId, startDate, endDate)` - Get payment statistics

## Using the Repository Factory

The `repositoryFactory.js` provides an easy way to get repository instances:

```javascript
import { getUserRepository, getPaymentRepository, REPOSITORY_TYPES } from '../repositories/repositoryFactory';

// Get repository instances (defaults to MONGODB)
const userRepository = getUserRepository();
const paymentRepository = getPaymentRepository();

// Or specify implementation type explicitly
const mongooseUserRepo = getUserRepository(REPOSITORY_TYPES.MONGOOSE);
```

## Configuration

The repository type can be configured using environment variables:

```env
# .env
REPOSITORY_TYPE=mongodb  # or 'mongoose'
```

## Adding a New Repository

1. Create a new repository class in both `mongodb/` and `mongoose/` directories
2. Extend the `BaseRepository` class
3. Implement all required methods
4. Add the repository to the factory

Example for a new `ProductRepository`:

```javascript
// repositories/mongodb/productRepository.js
import BaseRepository from '../baseRepository.js';

export default class ProductRepository extends BaseRepository {
  // Implement methods
}

// repositories/mongoose/productRepository.js
import BaseRepository from '../baseRepository.js';

export default class ProductRepository extends BaseRepository {
  // Implement methods
}

// Add to repositoryFactory.js
const REPOSITORY_IMPLEMENTATIONS = {
  [REPOSITORY_TYPES.MONGOOSE]: {
    // ...
    product: ProductRepository,
  },
  [REPOSITORY_TYPES.MONGODB]: {
    // ...
    product: ProductRepository,
  }
};

export const getProductRepository = (type) => getRepository('product', type);
```

## Best Practices

1. **Services Should Use Repositories**: All database access should go through repositories
2. **Keep Business Logic in Services**: Repositories should only handle data access
3. **Use Transactions for Multiple Operations**: When multiple operations need to be atomic
4. **Handle Errors Appropriately**: Let the service layer handle business logic errors

## Testing

When testing services, you can easily mock repositories:

```javascript
import { getUserRepository } from '../../repositories/repositoryFactory';

jest.mock('../../repositories/repositoryFactory');

describe('UserService', () => {
  let mockUserRepository;
  
  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      // ... other methods
    };
    
    getUserRepository.mockReturnValue(mockUserRepository);
  });
  
  it('should create a new user', async () => {
    // Test implementation
  });
});
```

## Migration from Direct Database Access

1. Replace direct model imports with repository imports
2. Move query logic to appropriate repository methods
3. Update services to use the new repository methods
4. Update tests to mock repositories instead of models

## Performance Considerations

- The repository pattern adds a thin abstraction layer, which has minimal performance impact
- For high-performance scenarios, consider using the native MongoDB driver directly
- Use indexes and proper query optimization regardless of the repository implementation

## Troubleshooting

### Common Issues

1. **Circular Dependencies**: Be careful with imports between repositories
2. **Transaction Management**: Ensure proper session handling for transactions
3. **Connection Handling**: The repository factory manages connections automatically

### Debugging

Set `DEBUG=repository:*` to enable debug logs for repository operations.

## Conclusion

The repository pattern provides a clean separation of concerns and makes the codebase more maintainable and testable. By following the patterns and practices outlined in this document, you can ensure consistent and reliable data access throughout the application.
