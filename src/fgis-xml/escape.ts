/**
 * Текст элемента. Кавычки не экранируем: атрибутов в выгрузке нет, а эталоны
 * клиента пишут «"Анализатор калибровочный Citrex H4"» как есть (5-26-ИВЛ).
 */
export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Тег с текстом; пустой → <Name></Name> (как в эталонах). */
export function el(name: string, text: string | number | boolean | null | undefined): string {
  const v =
    text === null || text === undefined
      ? ''
      : typeof text === 'boolean'
        ? text
          ? 'true'
          : 'false'
        : String(text)
  return `<${name}>${escapeXml(v)}</${name}>`
}

export function open(name: string): string {
  return `<${name}>`
}

export function close(name: string): string {
  return `</${name}>`
}

export function wrap(name: string, inner: string): string {
  return `${open(name)}${inner}${close(name)}`
}
