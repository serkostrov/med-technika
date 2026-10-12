import { normalizeCustomerName } from '@/dictionaries/normalize/text'
import type { Customer } from '@/domain'

export function matchCustomerByName(
  customers: readonly Customer[],
  name: string | null | undefined,
): Customer | null {
  if (!name?.trim()) return null
  const key = normalizeCustomerName(name)
  return (
    customers.find((c) => {
      if (c.deletedAt) return false
      if (normalizeCustomerName(c.name) === key) return true
      return c.nameAliases.some((a) => normalizeCustomerName(a) === key)
    }) ?? null
  )
}
