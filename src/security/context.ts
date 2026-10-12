import { AppRole } from '@/domain'
import type { EntityId } from '@/domain'

/**
 * Контекст запроса на сервере (аналог auth.uid() + staff в Supabase).
 * UI не является источником прав — только этот контекст.
 */
export type AuthContext = {
  authUserId: EntityId
  staffId: EntityId
  role: AppRole
  email: string
}

export function isHead(ctx: AuthContext): boolean {
  return ctx.role === AppRole.head
}

export function isEngineer(ctx: AuthContext): boolean {
  return ctx.role === AppRole.engineer
}

export function currentStaffId(ctx: AuthContext): EntityId {
  return ctx.staffId
}

/** Протокол «свой» для инженера: uploaded_by или engineer_staff_id (ТЗ §5). */
export function ownsProtocol(
  ctx: AuthContext,
  protocol: { uploadedBy: EntityId | null; engineerStaffId: EntityId | null },
): boolean {
  const me = currentStaffId(ctx)
  return protocol.uploadedBy === me || protocol.engineerStaffId === me
}
