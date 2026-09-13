const quotaMiddleware = require('../../../src/core/auth/quota.middleware');

jest.mock('../../../src/core/db/supabase.client', () => ({
  getSupabaseClient: jest.fn()
}));

const { getSupabaseClient } = require('../../../src/core/db/supabase.client');

describe('Quota Middleware', () => {
  let mockReq;
  let mockRes;
  let nextFunction;
  let mockSupabase;

  beforeEach(() => {
    mockReq = {
      user: { id: 'user-123' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFunction = jest.fn();
    mockSupabase = {
      from: jest.fn()
    };
    getSupabaseClient.mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if req.user is missing', async () => {
    mockReq.user = undefined;
    await quotaMiddleware(mockReq, mockRes, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  const setupMocks = (mockUsage) => {
    mockSupabase.from = jest.fn().mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { plan_id: 'plan-1', status: 'active' } })
            })
          })
        };
      }
      if (table === 'plans') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { ai_requests_per_month: 100, ai_tokens_per_month: 1000 } })
            })
          })
        };
      }
      if (table === 'usage_periods') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [mockUsage] })
              })
            })
          })
        };
      }
    });
  };

  it('should allow if quota is not exceeded', async () => {
    setupMocks({ ai_requests: 10, ai_tokens: 100, period_end: '2050-01-01' });

    await quotaMiddleware(mockReq, mockRes, nextFunction);

    expect(mockReq.quota).toBeDefined();
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should block if tokens are exhausted', async () => {
    setupMocks({ ai_requests: 10, ai_tokens: 1000, period_end: '2050-01-01' });

    await quotaMiddleware(mockReq, mockRes, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'AI quota exhausted' }));
    expect(nextFunction).not.toHaveBeenCalled();
  });
});
