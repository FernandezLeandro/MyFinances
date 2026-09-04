import { useId, useMemo } from 'react'
import type { InputHTMLAttributes, Ref } from 'react'
import { Input } from '@/components/ui/Input'
import { useReceivables } from '@/features/receivables/api'

type PersonNameInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'list'> & {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

/**
 * `Input` de texto libre con sugerencias de nombres ya usados en otras deudas ("mi pareja", "Juan…")
 * vía `<datalist>` nativo — sin tabla de personas ni migración: resuelve el tipeo repetido del caso
 * más frecuente (gastos compartidos con la misma persona) manteniendo el campo como texto libre para
 * cualquier otro caso puntual.
 */
export function PersonNameInput({ invalid, ref, ...props }: PersonNameInputProps) {
  const listId = useId()
  const { data: receivables } = useReceivables()

  const names = useMemo(() => {
    const seen = new Set<string>()
    for (const r of receivables ?? []) {
      const trimmed = r.name.trim()
      if (trimmed) seen.add(trimmed)
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'es'))
  }, [receivables])

  return (
    <>
      <Input ref={ref} invalid={invalid} list={listId} autoComplete="off" {...props} />
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}
