export class SecurityError extends Error {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  httpStatus: 401 | 403 | 404

  constructor(
    message: string,
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND',
    httpStatus: 401 | 403 | 404,
  ) {
    super(message)
    this.name = 'SecurityError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export function unauthenticated(message = 'Требуется аутентификация'): never {
  throw new SecurityError(message, 'UNAUTHENTICATED', 401)
}

export function forbidden(message = 'Недостаточно прав'): never {
  throw new SecurityError(message, 'FORBIDDEN', 403)
}

export function notFound(message = 'Не найдено'): never {
  throw new SecurityError(message, 'NOT_FOUND', 404)
}
