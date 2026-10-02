const authMiddleware = require('../../../src/core/auth/auth.middleware');
const jwt = require('jsonwebtoken');

jest.mock('../../../src/core/db/supabase.client', () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async token => {
        if (token === 'invalid-token') return { data: { user: null }, error: new Error('Invalid token') };
        return { data: { user: { id: 'user-123', email: 'test@example.com' } }, error: null };
      }),
    },
  })),
}));

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let nextFunction;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    nextFunction = jest.fn();
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    process.env.SUPABASE_URL = 'http://test-url.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  afterEach(() => jest.clearAllMocks());

  it('should return 401 if no Authorization header is present', async () => {
    await authMiddleware(mockReq, mockRes, nextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 if token is invalid', async () => {
    mockReq.headers.authorization = 'Bearer invalid-token';
    await authMiddleware(mockReq, mockRes, nextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token', details: 'Invalid token' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next() and set req.user if token is valid', async () => {
    mockReq.headers.authorization = 'Bearer valid-token';
    await authMiddleware(mockReq, mockRes, nextFunction);
    expect(mockReq.user).toBeDefined();
    expect(mockReq.user.id).toBe('user-123');
    expect(mockReq.user.email).toBe('test@example.com');
    expect(nextFunction).toHaveBeenCalled();
  });
});
