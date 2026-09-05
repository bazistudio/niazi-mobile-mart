const BaseRepository = require('../BaseRepository');
const UserSession = require('../../models/UserSession');

class SessionRepository extends BaseRepository {
  constructor() {
    super(UserSession);
  }

  async revokeAllUserSessions(userId, options = {}) {
    return await this.updateMany({ userId, status: 'ACTIVE' }, { status: 'REVOKED', revokedAt: new Date() }, options);
  }
}

module.exports = SessionRepository;
