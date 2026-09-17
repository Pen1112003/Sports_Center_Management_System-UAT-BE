import 'node:process'

export const config = {
  port: Number(process.env.PORT ?? 3000),
  accessSecret: process.env.JWT_ACCESS_SECRET ?? 'local-access-secret-change-me',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'local-refresh-secret-change-me',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
}
