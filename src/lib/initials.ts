/**
 * Iniciales para el avatar de cuenta: 1-2 letras a partir del nombre. `displayName` puede ser `null`
 * (cuenta recién creada o que todavía no completó `/bienvenida` — ver el comentario de `useProfile`
 * en `features/profile/api.ts`), y ahí se cae al local-part del email; si tampoco hay email, "?".
 */
export function initialsFrom(displayName: string | null | undefined, email: string | null | undefined): string {
  const name = displayName?.trim()
  if (name) {
    const words = name.split(/\s+/).filter(Boolean)
    if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
    return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
  }

  const localPart = email?.trim().split('@')[0]
  if (localPart) return localPart.slice(0, 2).toUpperCase()

  return '?'
}
