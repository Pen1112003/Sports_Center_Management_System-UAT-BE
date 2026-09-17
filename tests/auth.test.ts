import { describe, expect, it } from 'vitest'
import { hashToken } from '../src/auth.js'

describe('FR-001 auth primitives', () => {
  it('hashes refresh tokens deterministically without storing the raw token', () => {
    expect(hashToken('refresh-token')).toHaveLength(64)
    expect(hashToken('refresh-token')).toBe(hashToken('refresh-token'))
    expect(hashToken('refresh-token')).not.toBe('refresh-token')
  })
})
