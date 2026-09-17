import express from 'express'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { config } from './config.js'
import { findUser, issueSession, REFRESH_COOKIE, revokeRefreshToken, rotateRefreshToken, verifyPassword } from './auth.js'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', config.frontendOrigin)
  response.setHeader('Access-Control-Allow-Credentials', 'true')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})

const loginLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { code: 'RATE_LIMITED', message: 'Quá nhiều lần thử đăng nhập' } })
const loginSchema = z.object({ identifier: z.string().min(1), password: z.string().min(8) })

function publicUser(user: { id: number; email: string; phone: string | null; displayName: string; role: { name: string } }) {
  return { id: user.id, email: user.email, phone: user.phone, displayName: user.displayName, role: user.role.name }
}

app.get('/health', (_request, response) => response.json({ status: 'ok' }))

app.post('/api/auth/login', loginLimiter, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body)
  if (!parsed.success) return response.status(422).json({ code: 'VALIDATION_ERROR', message: 'Thông tin đăng nhập không hợp lệ', details: parsed.error.flatten() })
  const user = await findUser(parsed.data.identifier)
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return response.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng' })
  if (user.status !== 'ACTIVE') return response.status(403).json({ code: 'ACCOUNT_LOCKED', message: 'Tài khoản của bạn đã bị khóa, vui lòng liên hệ Ban quản lý' })
  const session = await issueSession(user)
  response.cookie(REFRESH_COOKIE, session.refreshToken, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth' })
  return response.json({ accessToken: session.accessToken, expiresIn: session.expiresIn, user: publicUser(user) })
})

app.post('/api/auth/refresh', async (request, response) => {
  const token = request.cookies[REFRESH_COOKIE]
  if (!token) return response.status(401).json({ code: 'MISSING_REFRESH_TOKEN', message: 'Refresh token không tồn tại' })
  try {
    const session = await rotateRefreshToken(token)
    response.cookie(REFRESH_COOKIE, session.refreshToken, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth' })
    return response.json({ accessToken: session.accessToken, expiresIn: session.expiresIn })
  } catch {
    return response.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token không hợp lệ hoặc đã hết hạn' })
  }
})

app.post('/api/auth/logout', async (request, response) => {
  const token = request.cookies[REFRESH_COOKIE]
  if (token) await revokeRefreshToken(token)
  response.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/api/auth' })
  return response.status(204).send()
})

app.get('/api/auth/me', (request, response) => {
  const authorization = request.header('authorization')
  if (!authorization?.startsWith('Bearer ')) return response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Cần đăng nhập' })
  try {
    const payload = jwt.verify(authorization.slice(7), config.accessSecret) as jwt.JwtPayload & { sub?: string; role?: string }
    return response.json({ userId: Number(payload.sub), role: payload.role })
  } catch {
    return response.status(401).json({ code: 'INVALID_ACCESS_TOKEN', message: 'Access token không hợp lệ hoặc đã hết hạn' })
  }
})

export { app }

if (process.env.NODE_ENV !== 'test') app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`))
