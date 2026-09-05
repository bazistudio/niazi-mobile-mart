const orgAccessMiddleware = require('../../middleware/orgAccessMiddleware');
const OrganizationMember = require('../../models/OrganizationMember');
const { getTenantStore } = require('../../middleware/context/asyncContext');

jest.mock('../../models/OrganizationMember');
jest.mock('../../middleware/context/asyncContext', () => ({
  getTenantStore: jest.fn(() => ({}))
}));

describe('orgAccessMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { id: 'user123' },
      headers: {},
      body: {},
      query: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    req.user = null;
    const middleware = orgAccessMiddleware();
    await middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('should return 400 if organizationId is missing', async () => {
    const middleware = orgAccessMiddleware();
    await middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Organization ID is required' }));
  });

  it('should return 403 if user is not an active member', async () => {
    req.headers['x-organization-id'] = 'org123';
    OrganizationMember.findOne.mockResolvedValue(null);
    
    const middleware = orgAccessMiddleware();
    await middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Forbidden: You are not an active member of this organization' }));
  });

  it('should attach orgContext and call next if member is valid and no specific permissions required', async () => {
    req.headers['x-organization-id'] = 'org123';
    OrganizationMember.findOne.mockResolvedValue({
      organizationId: 'org123',
      userId: 'user123',
      status: 'ACTIVE',
      role: 'ADMIN',
      isSystemOwner: false
    });
    
    const middleware = orgAccessMiddleware();
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.orgContext.organizationId).toBe('org123');
    expect(req.orgContext.role).toBe('ADMIN');
  });

  it('should allow system owner access without specific permission checks', async () => {
    req.headers['x-organization-id'] = 'org123';
    OrganizationMember.findOne.mockResolvedValue({
      organizationId: 'org123',
      userId: 'user123',
      status: 'ACTIVE',
      role: 'OWNER',
      isSystemOwner: true
    });
    
    const middleware = orgAccessMiddleware(['non.existent.permission']);
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  it('should reject if user lacks required permissions', async () => {
    req.headers['x-organization-id'] = 'org123';
    OrganizationMember.findOne.mockResolvedValue({
      organizationId: 'org123',
      userId: 'user123',
      status: 'ACTIVE',
      role: 'STAFF', // STAFF has limited perms
      isSystemOwner: false,
      permissions: [] // no extra perms
    });
    
    const middleware = orgAccessMiddleware(['org.settings.manage']); // STAFF doesn't have this
    await middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Forbidden: Insufficient permissions for this action' }));
  });

  it('should allow shop-specific overrides to grant permissions', async () => {
    req.headers['x-organization-id'] = 'org123';
    req.headers['x-shop-id'] = 'shop123';
    
    OrganizationMember.findOne.mockResolvedValue({
      organizationId: 'org123',
      userId: 'user123',
      status: 'ACTIVE',
      role: 'STAFF', // Base role doesn't have settings access
      isSystemOwner: false,
      shopAccess: [
        {
          shopId: 'shop123',
          role: 'ADMIN' // Shop role HAS settings access implicitly (or explicitly via permissions)
        }
      ]
    });
    
    const middleware = orgAccessMiddleware(['settings.manage']);
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.orgContext.role).toBe('ADMIN'); // Resolved role should be ADMIN for this request
  });
});
