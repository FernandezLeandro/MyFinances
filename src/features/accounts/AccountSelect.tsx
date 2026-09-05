import { Select } from '@/components/ui/Select'
import { useBalanceLocations, type AccountKind } from '@/features/reconciliation/api'

const kindLabel: Record<AccountKind, string> = { cash: 'Efectivo', wallet: 'Billeteras virtuales', bank: 'Bancos' }

interface AccountSelectProps {
  id?: string
  value: string
  onChange: (accountId: string) => void
  /** Etiqueta de la opción vacía. Default pensado para el selector de "con qué pagué". */
  emptyLabel?: string
}

/** Selector de cuenta reutilizado en el form de movimientos y en cada diálogo de pago (Fijos,
 *  Créditos, Me Deben) — un único lugar para agrupar por tipo y filtrar archivadas. Sin RHF
 *  `register` directo porque algunos consumidores (RPCs de pago) no tienen formulario alrededor. */
export function AccountSelect({ id, value, onChange, emptyLabel = 'Sin asignar' }: AccountSelectProps) {
  const { data: locations } = useBalanceLocations()
  const active = (locations ?? []).filter((l) => !l.is_archived)
  const groups: AccountKind[] = ['cash', 'wallet', 'bank']

  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {groups.map((kind) => {
        const inGroup = active.filter((l) => l.kind === kind)
        if (inGroup.length === 0) return null
        return (
          <optgroup key={kind} label={kindLabel[kind]}>
            {inGroup.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name || '(sin nombre)'}
              </option>
            ))}
          </optgroup>
        )
      })}
    </Select>
  )
}
