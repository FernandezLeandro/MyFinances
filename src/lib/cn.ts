/** Une clases condicionales sin arrastrar una dependencia para algo de tres líneas. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
