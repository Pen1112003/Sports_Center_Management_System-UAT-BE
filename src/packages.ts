import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { config } from './config.js'

export const createPackageSchema = z.object({
  code: z
    .string()
    .min(2, 'Mã gói phải có ít nhất 2 ký tự')
    .max(50, 'Mã gói không vượt quá 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã gói chỉ gồm chữ cái, số, gạch ngang và gạch dưới'),
  name: z.string().min(2, 'Tên gói tập phải có ít nhất 2 ký tự').max(100, 'Tên gói không vượt quá 100 ký tự'),
  description: z.string().max(500, 'Mô tả không vượt quá 500 ký tự').optional().nullable(),
  price: z.coerce.number().int('Giá gói phải là số nguyên').positive('Giá gói tập phải lớn hơn 0'),
  durationDays: z.coerce.number().int('Thời hạn phải là số ngày nguyên').positive('Thời hạn sử dụng phải lớn hơn 0 ngày'),
  sessionLimit: z.coerce.number().int().positive('Số buổi tập phải lớn hơn 0').optional().nullable(),
  sportType: z.string().min(1, 'Vui lòng chọn bộ môn áp dụng'),
  benefits: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  isBestSeller: z.boolean().optional().default(false),
})

export const updatePackageSchema = z.object({
  name: z.string().min(2, 'Tên gói tập phải có ít nhất 2 ký tự').max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  price: z.coerce.number().int().positive('Giá gói tập phải lớn hơn 0').optional(),
  durationDays: z.coerce.number().int().positive('Thời hạn sử dụng phải lớn hơn 0 ngày').optional(),
  sessionLimit: z.coerce.number().int().positive('Số buổi tập phải lớn hơn 0').optional().nullable(),
  sportType: z.string().min(1).optional(),
  benefits: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  isBestSeller: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
})

export function requireManager(request: Request, response: Response): number | null {
  const authorization = request.header('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Cần đăng nhập' })
    return null
  }

  try {
    const payload = jwt.verify(authorization.slice(7), config.accessSecret) as jwt.JwtPayload & {
      sub?: string
      role?: string
    }
    if (!payload.sub || payload.role !== 'CENTER_MANAGER') {
      response.status(403).json({
        code: 'MANAGER_ACCESS_REQUIRED',
        message: 'Chỉ Quản lý trung tâm (Center Manager) mới có quyền quản lý danh mục gói tập',
      })
      return null
    }
    return Number(payload.sub)
  } catch {
    response.status(401).json({
      code: 'INVALID_ACCESS_TOKEN',
      message: 'Access token không hợp lệ hoặc đã hết hạn',
    })
    return null
  }
}

export function parseBenefits(benefits: string | null | undefined): string[] {
  if (!benefits) return []
  try {
    const parsed = JSON.parse(benefits)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // String fallback separated by comma or semicolon
    return benefits
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function serializeBenefits(benefits: string[] | string | null | undefined): string | null {
  if (!benefits) return null
  if (Array.isArray(benefits)) {
    return JSON.stringify(benefits.map((b) => b.trim()).filter(Boolean))
  }
  return benefits.trim() || null
}

export function formatPackage(pkg: {
  id: number
  code: string
  name: string
  description: string | null
  price: number
  durationDays: number
  sessionLimit: number | null
  sportType: string
  benefits: string | null
  isBestSeller: boolean
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  createdAt: Date
  updatedAt: Date
  _count?: { memberships: number }
}) {
  return {
    id: pkg.id,
    code: pkg.code,
    name: pkg.name,
    description: pkg.description,
    price: pkg.price,
    durationDays: pkg.durationDays,
    sessionLimit: pkg.sessionLimit,
    sportType: pkg.sportType,
    benefits: parseBenefits(pkg.benefits),
    isBestSeller: pkg.isBestSeller,
    status: pkg.status,
    activeSubscribers: pkg._count?.memberships ?? 0,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  }
}
