import { AppRole } from '@/domain'
import type { EntityId } from '@/domain'
import type { AuthContext } from '@/security'
import { forbidden, notFound, unauthenticated } from '@/security'
import type { Database } from '@/server/db/database'
import { hashPassword, verifyPassword } from './password'
import type { AuthAccount } from './types'

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000

export type PublicAccount = {
  id: EntityId
  email: string
  staffId: EntityId
  role: AppRole
  fullName: string
  isActive: boolean
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export class AuthService {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  /** Саморегистрации нет (ТЗ §5). */
  selfRegister(): never {
    forbidden('Саморегистрация отключена. Учётную запись создаёт начальник ИЛ.')
  }

  async createAccount(
    actor: AuthContext,
    input: {
      email: string
      password: string
      staffId: EntityId
    },
  ): Promise<PublicAccount> {
    if (actor.role !== AppRole.head) {
      forbidden('Создавать учётные записи может только начальник ИЛ')
    }

    const email = input.email.trim().toLowerCase()
    if (!email || !input.password) {
      forbidden('Укажите email и пароль')
    }
    if (this.db.authAccounts.some((a) => a.email === email)) {
      forbidden('Учётная запись с таким email уже существует')
    }

    const staff = this.db.staff.find(
      (s) => s.id === input.staffId && s.deletedAt === null,
    )
    if (!staff) notFound('Сотрудник не найден')
    if (staff.authUserId) {
      forbidden('У сотрудника уже есть учётная запись')
    }

    const account: AuthAccount = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(input.password),
      staffId: staff.id,
      createdBy: actor.staffId,
      createdAt: new Date().toISOString(),
      isActive: true,
    }
    this.db.authAccounts.push(account)
    staff.authUserId = account.id

    return this.toPublic(account)
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; account: PublicAccount }> {
    const normalized = email.trim().toLowerCase()
    const account = this.db.authAccounts.find(
      (a) => a.email === normalized && a.isActive,
    )
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      unauthenticated('Неверный email или пароль')
    }

    const staff = this.db.staff.find((s) => s.id === account.staffId)
    if (!staff || !staff.isActive || staff.deletedAt) {
      unauthenticated('Учётная запись не связана с активным сотрудником')
    }

    const token = randomToken()
    this.db.sessions.push({
      token,
      authUserId: account.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    })

    return { token, account: this.toPublic(account) }
  }

  resolveToken(token: string | null | undefined): AuthContext {
    if (!token) unauthenticated()
    const session = this.db.sessions.find((s) => s.token === token)
    if (!session) unauthenticated('Сессия недействительна')
    if (Date.parse(session.expiresAt) < Date.now()) {
      unauthenticated('Сессия истекла')
    }

    const account = this.db.authAccounts.find(
      (a) => a.id === session.authUserId && a.isActive,
    )
    if (!account) unauthenticated()

    const staff = this.db.staff.find(
      (s) => s.id === account.staffId && s.deletedAt === null && s.isActive,
    )
    if (!staff) unauthenticated('Сотрудник неактивен')

    return {
      authUserId: account.id,
      staffId: staff.id,
      role: staff.appRole,
      email: account.email,
    }
  }

  listAccounts(actor: AuthContext): PublicAccount[] {
    if (actor.role !== AppRole.head) {
      forbidden('Список пользователей доступен только начальнику ИЛ')
    }
    return this.db.authAccounts.map((a) => this.toPublic(a))
  }

  async setPassword(
    actor: AuthContext,
    input: { staffId: EntityId; password: string },
  ): Promise<PublicAccount> {
    if (actor.role !== AppRole.head) {
      forbidden('Менять пароль может только начальник ИЛ')
    }
    if (!input.password) {
      forbidden('Укажите пароль')
    }
    const staff = this.db.staff.find(
      (s) => s.id === input.staffId && s.deletedAt === null,
    )
    if (!staff) notFound('Сотрудник не найден')
    if (!staff.authUserId) {
      forbidden('У сотрудника нет учётной записи — сначала создайте её')
    }
    const account = this.db.authAccounts.find((a) => a.id === staff.authUserId)
    if (!account) notFound('Учётная запись не найдена')
    account.passwordHash = await hashPassword(input.password)
    return this.toPublic(account)
  }

  private toPublic(account: AuthAccount): PublicAccount {
    const staff = this.db.staff.find((s) => s.id === account.staffId)
    return {
      id: account.id,
      email: account.email,
      staffId: account.staffId,
      role: staff?.appRole ?? AppRole.engineer,
      fullName: staff?.fullName ?? '',
      isActive: account.isActive,
    }
  }
}
