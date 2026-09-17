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
}

main().finally(() => prisma.$disconnect())
