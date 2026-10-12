/**
 * Простые in-process блокировки на id протокола.
 * Защищают от гонки двух сессий (approve / export / delete) на одной БД.
 */
export class ProtocolLocks {
  private readonly held = new Set<string>()

  withLock<T>(ids: string[], fn: () => T): T {
    const unique = [...new Set(ids)].sort()
    for (const id of unique) {
      if (this.held.has(id)) {
        throw Object.assign(
          new Error(
            `Протокол ${id} сейчас обрабатывается другим пользователем. Повторите позже.`,
          ),
          { code: 'CONCURRENT_PROTOCOL' },
        )
      }
    }
    for (const id of unique) this.held.add(id)
    try {
      return fn()
    } finally {
      for (const id of unique) this.held.delete(id)
    }
  }
}
