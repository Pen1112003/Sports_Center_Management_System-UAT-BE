import { createServer, type Server } from 'node:http'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/server.js'
import { config } from '../src/config.js'
import { prisma } from '../src/prisma.js'

type TestUser = { id: number; token: string }

let server: Server
let baseUrl: string

async function createMember(email: string): Promise<TestUser> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'MEMBER' } })
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('ChangeMe123!', 4),
      displayName: 'FR-002 Member',
      roleId: role.id,
      memberships: { create: { startDate: new Date(Date.now() - 60_000), endDate: new Date(Date.now() + 86_400_000) } },
    },
  })
  return { id: user.id, token: jwt.sign({ sub: user.id, role: 'MEMBER', type: 'access' }, config.accessSecret, { expiresIn: '1h' }) }
}

async function createClass(startHour: number, capacity = 2) {
  const classDate = new Date(Date.now() + 86_400_000)
  const startTime = new Date(classDate)
  startTime.setHours(startHour, 0, 0, 0)
  const endTime = new Date(classDate)
  endTime.setHours(startHour + 1, 0, 0, 0)
  return prisma.classSchedule.create({ data: { courseName: 'FR-002 Test Class', classDate, startTime, endTime, room: 'Test Room', capacity } })
}

async function request(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } })
}

beforeAll(async () => {
  server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as { port: number }
  baseUrl = `http://127.0.0.1:${address.port}`
})

beforeEach(async () => {
  await prisma.classRegistration.deleteMany()
  await prisma.classSchedule.deleteMany({ where: { courseName: 'FR-002 Test Class' } })
  await prisma.user.deleteMany({ where: { email: { startsWith: 'fr002-' } } })
})

afterAll(async () => {
  await prisma.$disconnect()
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

describe('FR-002 class registration', () => {
  it('registers a member when membership, schedule, and capacity are valid', async () => {
    const member = await createMember('fr002-success@sports-center.local')
    const classSchedule = await createClass(18)

    const response = await request('/api/class-registrations', member.token, { method: 'POST', body: JSON.stringify({ classId: classSchedule.id }) })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ classId: classSchedule.id, status: 'CONFIRMED' })
  })

  it('blocks registration when the class is full', async () => {
    const firstMember = await createMember('fr002-full-1@sports-center.local')
    const secondMember = await createMember('fr002-full-2@sports-center.local')
    const classSchedule = await createClass(18, 1)
    await request('/api/class-registrations', firstMember.token, { method: 'POST', body: JSON.stringify({ classId: classSchedule.id }) })

    const response = await request('/api/class-registrations', secondMember.token, { method: 'POST', body: JSON.stringify({ classId: classSchedule.id }) })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CLASS_FULL' })
  })

  it('blocks registration when the member has a schedule conflict', async () => {
    const member = await createMember('fr002-conflict@sports-center.local')
    const existingClass = await createClass(18)
    const conflictingClass = await createClass(18)
    await request('/api/class-registrations', member.token, { method: 'POST', body: JSON.stringify({ classId: existingClass.id }) })

    const response = await request('/api/class-registrations', member.token, { method: 'POST', body: JSON.stringify({ classId: conflictingClass.id }) })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'SCHEDULE_CONFLICT' })
  })

  it('blocks registration when the membership is expired', async () => {
    const member = await createMember('fr002-expired@sports-center.local')
    await prisma.membership.updateMany({ where: { userId: member.id }, data: { endDate: new Date(Date.now() - 60_000) } })
    const classSchedule = await createClass(20)

    const response = await request('/api/class-registrations', member.token, { method: 'POST', body: JSON.stringify({ classId: classSchedule.id }) })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'MEMBERSHIP_INACTIVE' })
  })
})
