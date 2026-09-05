const BaseRepository = require('../BaseRepository');
const AuditLog = require('../../models/AuditLog');

class AuditLogRepository extends BaseRepository {
  constructor() {
    super(AuditLog);
  }
}

module.exports = AuditLogRepository;
