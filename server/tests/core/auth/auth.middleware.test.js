const authMiddleware = require('../../../src/core/auth/auth.middleware');
const jwt = require('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let nextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFunction = jest.fn();
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if no Authorization header is present', () => {
    authMiddleware(mockReq, mockRes, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 if token is invalid', () => {
    mockReq.headers.authorization = 'Bearer invalid-token';
    authMiddleware(mockReq, mockRes, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next() and set req.user if token is valid', () => {
    const validToken = jwt.sign({ sub: 'user-123', email: 'test@example.com' }, process.env.SUPABASE_JWT_SECRET);
    mockReq.headers.authorization = `Bearer ${validToken}`;

    authMiddleware(mockReq, mockRes, nextFunction);

    expect(mockReq.user).toBeDefined();
    expect(mockReq.user.id).toBe('user-123');
    expect(mockReq.user.email).toBe('test@example.com');
    expect(nextFunction).toHaveBeenCalled();
  });
});
