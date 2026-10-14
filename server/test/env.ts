// imported first by the integration test: config.ts reads process.env when it is loaded
process.env.JWT_SECRET = 'integration-test-secret-integration-test-secret';
process.env.GAME_SPEED = '40';
process.env.PORT = '0';
process.env.CORS_ORIGINS = 'http://localhost';
