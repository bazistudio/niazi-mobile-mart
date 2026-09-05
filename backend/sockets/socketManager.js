const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

class SocketManager {
  constructor() {
    this.io = null;
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*", // Adjust in production
        methods: ["GET", "POST"],
      },
    });

    // Authentication Middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
      } catch (err) {
        return next(new Error("Authentication error: Invalid token"));
      }
    });

    this.io.on("connection", (socket) => {
      const { _id, shopId, role } = socket.user;
      
      logger.info(`Socket connected: ${socket.id} (User: ${_id}, Shop: ${shopId})`);

      // Join tenant-specific room
      if (shopId) {
        socket.join(`tenant:${shopId}`);
        logger.info(`User ${_id} joined room tenant:${shopId}`);
      }

      // Join user-specific room
      socket.join(`user:${_id}`);

      socket.on("disconnect", () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });

    console.log("Socket.io initialized");
    return this.io;
  }

  getIO() {
    if (!this.io) {
      throw new Error("Socket.io not initialized!");
    }
    return this.io;
  }

  /**
   * Send notification to all users in a tenant
   */
  toTenant(tenantId, event, data) {
    if (this.io) {
      this.io.to(`tenant:${tenantId}`).emit(event, data);
    }
  }

  /**
   * Send notification to a specific user
   */
  toUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }
}

module.exports = new SocketManager();
