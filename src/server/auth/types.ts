import type { EntityId, InstantUtc } from '@/domain'

/** Учётная запись приложения. Отдельно от staff (персонал ФГИС без логина). */
export type AuthAccount = {
  id: EntityId
  email: string
  passwordHash: string
  staffId: EntityId
  createdBy: EntityId | null
  createdAt: InstantUtc
  isActive: boolean
}

export type SessionToken = {
  token: string
  authUserId: EntityId
  expiresAt: InstantUtc
}
