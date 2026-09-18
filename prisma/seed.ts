import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const roles = ['CENTER_MANAGER', 'COACH', 'RECEPTIONIST', 'MEMBER']

async function main() {
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } })
  }

  const managerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'CENTER_MANAGER' } })
  await prisma.user.upsert({
    where: { email: 'manager@sports-center.local' },
    update: { roleId: managerRole.id },
    create: {
      email: 'manager@sports-center.local',
      phone: '0900000001',
      passwordHash: await bcrypt.hash('ChangeMe123!', 12),
      displayName: 'Center Manager',
      roleId: managerRole.id,
    },
  })

  const memberRole = await prisma.role.findUniqueOrThrow({ where: { name: 'MEMBER' } })
  const member = await prisma.user.upsert({
    where: { email: 'member@sports-center.local' },
    update: { roleId: memberRole.id },
    create: {
      email: 'member@sports-center.local',
      phone: '0900000002',
      passwordHash: await bcrypt.hash('ChangeMe123!', 12),
      displayName: 'Demo Member',
      roleId: memberRole.id,
    },
  })

  const now = new Date()
  const membership = await prisma.membership.findFirst({ where: { userId: member.id } })
  if (!membership) {
    await prisma.membership.create({
      data: { userId: member.id, startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000), endDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) },
    })
  }

  let classSchedule = await prisma.classSchedule.findFirst({ where: { courseName: 'Functional Strength' } })
  if (!classSchedule) {
    const classDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const startTime = new Date(classDate)
    startTime.setHours(18, 0, 0, 0)
    const endTime = new Date(classDate)
    endTime.setHours(19, 0, 0, 0)
    classSchedule = await prisma.classSchedule.create({
      data: {
        courseName: 'Functional Strength',
        classDate,
        startTime,
        endTime,
        room: 'Studio A',
        capacity: 12,
      },
    })
  }
  await prisma.classRegistration.deleteMany({ where: { userId: member.id, classScheduleId: classSchedule.id } })
}

main().finally(() => prisma.$disconnect())
