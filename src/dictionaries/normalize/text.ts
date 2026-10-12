/** Нормализация текста: trim, схлопывание пробелов, NFC (ТЗ §6.3). */
export function normalizeText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ')
}

/**
 * Ключ заказчика (ТЗ §7.1): нижний регистр, кавычки удаляются,
 * ООО/АО/ГБУЗ сохраняются, пробелы схлопываются.
 */
export function normalizeCustomerName(name: string): string {
  return normalizeText(name)
    .toLowerCase()
    .replace(/[«»""„‟"']/g, '')
}

/**
 * serial_norm (ТЗ §7.2): trim, без пробелов, верхний регистр.
 * Ведущие нули сохраняем.
 */
export function normalizeSerial(serial: string): string {
  return serial.trim().replace(/\s+/g, '').toUpperCase()
}
