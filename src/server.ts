import express from 'express'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import swaggerUi from 'swagger-ui-express'
import { z } from 'zod'
import { config } from './config.js'
import { findUser, issueSession, REFRESH_COOKIE, revokeRefreshToken, rotateRefreshToken, verifyPassword } from './auth.js'
import { prisma } from './prisma.js'
import { openapiDocument } from './openapi.js'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.get('/api-docs.json', (_request, response) => response.json(openapiDocument))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument, { explorer: true }))
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

function requireMember(request: express.Request, response: express.Response) {
  const authorization = request.header('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Cần đăng nhập' })
    return null
  }
  try {
    const payload = jwt.verify(authorization.slice(7), config.accessSecret) as jwt.JwtPayload & { sub?: string; role?: string }
    if (!payload.sub || payload.role !== 'MEMBER') {
      response.status(403).json({ code: 'MEMBER_ACCESS_REQUIRED', message: 'Chỉ thành viên mới được đăng ký lớp' })
      return null
    }
    return Number(payload.sub)
  } catch {
    response.status(401).json({ code: 'INVALID_ACCESS_TOKEN', message: 'Access token không hợp lệ hoặc đã hết hạn' })
    return null
  }
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

app.get('/api/classes', async (request, response) => {
  const memberId = requireMember(request, response)
  if (!memberId) return
  const classes = await prisma.classSchedule.findMany({
    where: { status: 'OPEN', startTime: { gt: new Date() } },
    orderBy: { startTime: 'asc' },
    include: { _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } } },
  })
  return response.json(classes.map((classSchedule) => ({
    id: classSchedule.id,
    courseName: classSchedule.courseName,
    classDate: classSchedule.classDate,
    startTime: classSchedule.startTime,
    endTime: classSchedule.endTime,
    room: classSchedule.room,
    capacity: classSchedule.capacity,
    availableSlots: Math.max(classSchedule.capacity - classSchedule._count.registrations, 0),
  })))
})

const registrationSchema = z.object({ classId: z.coerce.number().int().positive() })

app.post('/api/class-registrations', async (request, response) => {
  const memberId = requireMember(request, response)
  if (!memberId) return
  const parsed = registrationSchema.safeParse(request.body)
  if (!parsed.success) return response.status(422).json({ code: 'VALIDATION_ERROR', message: 'classId không hợp lệ', details: parsed.error.flatten() })

  try {
    const registration = await prisma.$transaction(async (transaction) => {
      const classSchedule = await transaction.classSchedule.findUnique({ where: { id: parsed.data.classId } })
      if (!classSchedule || classSchedule.status !== 'OPEN') throw new Error('CLASS_NOT_FOUND')
      const now = new Date()
      const membership = await transaction.membership.findFirst({ where: { userId: memberId, status: 'ACTIVE', startDate: { lte: now }, endDate: { gt: now } } })
      if (!membership) throw new Error('MEMBERSHIP_INACTIVE')
      const existing = await transaction.classRegistration.findUnique({ where: { userId_classScheduleId: { userId: memberId, classScheduleId: classSchedule.id } } })
      if (existing?.status === 'CONFIRMED') throw new Error('ALREADY_REGISTERED')
      const conflict = await transaction.classRegistration.findFirst({ where: { userId: memberId, status: 'CONFIRMED', classSchedule: { startTime: { lt: classSchedule.endTime }, endTime: { gt: classSchedule.startTime } } } })
      if (conflict) throw new Error('SCHEDULE_CONFLICT')
      const registrationCount = await transaction.classRegistration.count({ where: { classScheduleId: classSchedule.id, status: 'CONFIRMED' } })
      if (registrationCount >= classSchedule.capacity) throw new Error('CLASS_FULL')
      return existing
        ? transaction.classRegistration.update({ where: { id: existing.id }, data: { status: 'CONFIRMED', registeredAt: now, cancelledAt: null } })
        : transaction.classRegistration.create({ data: { userId: memberId, classScheduleId: classSchedule.id } })
    })
    return response.status(201).json({ id: registration.id, classId: registration.classScheduleId, status: registration.status, registeredAt: registration.registeredAt })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'REGISTRATION_FAILED'
    const errors: Record<string, { status: number; message: string }> = {
      CLASS_NOT_FOUND: { status: 404, message: 'Lớp học không tồn tại hoặc đã đóng' },
      MEMBERSHIP_INACTIVE: { status: 403, message: 'Gói tập không còn hiệu lực' },
      ALREADY_REGISTERED: { status: 409, message: 'Bạn đã đăng ký lớp học này' },
      SCHEDULE_CONFLICT: { status: 409, message: 'Lịch học bị trùng với lớp đã đăng ký' },
      CLASS_FULL: { status: 409, message: 'Lớp học đã đủ số lượng' },
    }
    const failure = errors[code] ?? { status: 500, message: 'Không thể đăng ký lớp học' }
    return response.status(failure.status).json({ code, message: failure.message })
  }
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
