import { Select } from '@/components/ui/Select'
import { useBalanceLocations, type AccountKind } from '@/features/accounts/api'
import { accountSelectGroups } from '@/features/accounts/aggregate'

const kindLabel: Record<AccountKind, string> = { cash: 'Efectivo', wallet: 'Billeteras virtuales', bank: 'Bancos' }

interface AccountSelectProps {
  id?: string
  value: string
  onChange: (accountId: string) => void
  /** Sin la opción vacía: hay que elegir una cuenta (todo movimiento nuevo la lleva). Con `''` se
   *  muestra un "Elegí una cuenta" que no se puede volver a elegir. */
  required?: boolean
  /** Etiqueta de la opción vacía cuando NO es `required`. */
  emptyLabel?: string
}

/** Selector de cuenta reutilizado en el form de movimientos y en cada diálogo de pago (Fijos,
 *  Créditos, Me Deben) — un único lugar para agrupar por tipo y filtrar archivadas. Sin RHF
 *  `register` directo porque algunos consumidores (RPCs de pago) no tienen formulario alrededor.
 *  Una cuenta archivada sólo aparece si es la elegida ("(archivada)"): al editar un movimiento que
 *  ya la tenía, no puede desaparecer del selector ni pisarse sin querer al guardar. */
export function AccountSelect({ id, value, onChange, required = false, emptyLabel = 'Sin cuenta' }: AccountSelectProps) {
  const { data: locations } = useBalanceLocations()
  const groups = accountSelectGroups(locations ?? [], value)

  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {required ? (
        value === '' && (
          <option value="" disabled>
            Elegí una cuenta
          </option>
        )
      ) : (
        <option value="">{emptyLabel}</option>
      )}
      {groups.map((group) => (
        <optgroup key={group.kind} label={kindLabel[group.kind]}>
          {group.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || '(sin nombre)'}
              {a.archived ? ' (archivada)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}
