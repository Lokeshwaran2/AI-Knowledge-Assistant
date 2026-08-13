"use strict";
// Server configuration
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_CONFIG = void 0;
const extraCorsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];
exports.SERVER_CONFIG = {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'fallback_secret_change_in_prod',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    corsOrigins: Array.from(new Set(['http://localhost:5173', 'http://localhost:3000', ...extraCorsOrigins])),
};
//# sourceMappingURL=server.config.js.map