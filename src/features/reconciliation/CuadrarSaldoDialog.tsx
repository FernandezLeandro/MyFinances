import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useCreateTransaction, useCurrentBalance, type TransactionType } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import {
  useBalanceLocations,
  useCreateBalanceLocation,
  useCreateReceivable,
  useDeleteBalanceLocation,
  useDeleteReceivable,
  useReceivables,
  useUpdateBalanceLocation,
  useUpdateReceivable,
  type BalanceLocation,
  type Receivable,
} from '@/features/reconciliation/api'
import { reconciliar } from '@/features/reconciliation/aggregate'

interface CuadrarSaldoDialogProps {
  open: boolean
  onClose: () => void
}

/** Fila editable de nombre + monto, sin "Guardar" aparte: cada campo persiste solo al perder foco.
 *  Compartida entre "Dónde tenés la plata" y "Te deben" — son la misma forma con destino distinto. */
function EditableAmountRow({
  name: initialName,
  amountCents: initialAmountCents,
  placeholder,
  autoFocus,
  onSaveName,
  onSaveAmount,
  onDelete,
  deleteLabel,
}: {
  name: string
  amountCents: number
  placeholder: string
  autoFocus?: boolean
  onSaveName: (name: string) => void
  onSaveAmount: (cents: number) => void
  onDelete: () => void
  deleteLabel: string
}) {
  const [name, setName] = useState(initialName)
  const [amountInput, setAmountInput] = useState(() => centsToInputText(initialAmountCents))

  function saveName() {
    const trimmed = name.trim()
    if (trimmed === initialName) return
    onSaveName(trimmed)
  }

  function saveAmount() {
    const cents = parseAmountToCents(amountInput) ?? 0
    if (cents === initialAmountCents) return
    onSaveAmount(cents)
    setAmountInput(centsToInputText(cents))
  }

  return (
    <div className="flex items-center gap-2">
      {/* `Input` trae `w-full` fijo en su className base, y `cn()` acá es un simple join de
          strings (no tailwind-merge) — pasarle un `w-*` como override no gana de forma
          confiable contra ese `w-full`. El ancho de cada campo se controla en el wrapper. */}
      <div className="min-w-0 flex-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="h-10 text-[14px]"
        />
      </div>
      <div className="w-28 shrink-0">
        <Input
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          onBlur={saveAmount}
          inputMode="decimal"
          className="tnum h-10 text-right text-[14px]"
        />
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={deleteLabel}
        className="shrink-0 rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-coral"
      >
        <X className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}

function LugarRow({ location, autoFocus }: { location: BalanceLocation; autoFocus?: boolean }) {
  const updateLocation = useUpdateBalanceLocation()
  const deleteLocation = useDeleteBalanceLocation()

  return (
    <EditableAmountRow
      name={location.name}
      amountCents={location.amountCents}
      placeholder="Efectivo, Mercado Pago…"
      autoFocus={autoFocus}
      onSaveName={(name) => updateLocation.mutate({ id: location.id, name })}
      onSaveAmount={(cents) => updateLocation.mutate({ id: location.id, cents })}
      onDelete={() => deleteLocation.mutate(location.id)}
      deleteLabel={`Eliminar ${location.name || 'lugar'}`}
    />
  )
}

function DeudaRow({ receivable, autoFocus }: { receivable: Receivable; autoFocus?: boolean }) {
  const updateReceivable = useUpdateReceivable()
  const deleteReceivable = useDeleteReceivable()

  return (
    <EditableAmountRow
      name={receivable.name}
      amountCents={receivable.amountCents}
      placeholder="Juan, mi hermana…"
      autoFocus={autoFocus}
      onSaveName={(name) => updateReceivable.mutate({ id: receivable.id, name })}
      onSaveAmount={(cents) => updateReceivable.mutate({ id: receivable.id, cents })}
      onDelete={() => deleteReceivable.mutate(receivable.id)}
      deleteLabel={`Eliminar ${receivable.name || 'deuda'}`}
    />
  )
}

/**
 * Reemplaza al viejo "Ajustar saldo" de un solo campo: acá se desglosa dónde está la plata
 * (efectivo, cada plataforma) en vez de tener que sumarlo de memoria antes de escribir un único
 * número. La comparación sigue siendo contra `useCurrentBalance` — el mismo dato del héroe de Hoy —
 * y las dos salidas (ajustar directo / registrar como movimiento) son las que ya existían.
 *
 * "Te deben" suma del lado de "Tenés": prestar plata no genera un movimiento (no es un gasto, va a
 * volver), así que `rpc_current_balance` ya la cuenta — sin esto, el cuadre marca una diferencia
 * falsa. Ver el comentario de la migración `receivables` para el porqué completo.
 *
 * Sin diálogos anidados para el flujo principal: cada fila se edita y persiste sola (`onBlur`), sin
 * un "Guardar" aparte — cerrar a mitad de camino no pierde nada. La única excepción es "Registrar
 * como movimiento", que sí abre `TransactionFormDialog` encima, con el mismo guard de
 * `open && !registerPrompt` que ya usaba este diálogo antes de este cambio.
 */
export function CuadrarSaldoDialog({ open, onClose }: CuadrarSaldoDialogProps) {
  const { data: currentBalanceCents, isPending: isBalancePending } = useCurrentBalance()
  const { data: locations, isPending: isLocationsPending } = useBalanceLocations()
  const { data: receivables, isPending: isReceivablesPending } = useReceivables()
  const createLocation = useCreateBalanceLocation()
  const createReceivable = useCreateReceivable()
  const createTx = useCreateTransaction()
  const [registerPrompt, setRegisterPrompt] = useState<{ type: TransactionType; cents: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastAddedLocationId, setLastAddedLocationId] = useState<string | null>(null)
  const [lastAddedReceivableId, setLastAddedReceivableId] = useState<string | null>(null)

  const rec = useMemo(
    () => reconciliar(locations ?? [], receivables ?? [], currentBalanceCents ?? 0),
    [locations, receivables, currentBalanceCents],
  )
  const hasLocations = (locations ?? []).length > 0
  const hasReceivables = (receivables ?? []).length > 0
  const hasAnyRow = hasLocations || hasReceivables

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir el alta de movimiento encima). Sin este filtro, pasar
  // a "Registrar como movimiento" cerraba todo el flujo de un tirón.
  function handleDialogClose() {
    if (!registerPrompt) onClose()
  }

  async function handleAddLocation() {
    setError(null)
    const created = await createLocation.mutateAsync({ name: '', cents: 0 })
    setLastAddedLocationId(created.id)
  }

  async function handleAddReceivable() {
    setError(null)
    const created = await createReceivable.mutateAsync({ name: '', cents: 0 })
    setLastAddedReceivableId(created.id)
  }

  function validateDiff(): number | null {
    if (!hasAnyRow) {
      setError('Cargá al menos un lugar o una deuda')
      return null
    }
    if (rec.cuadrado) {
      setError('Ya está cuadrado — no hace falta ajustar nada')
      return null
    }
    return rec.diffCents
  }

  async function handleAdjustOnly() {
    const diff = validateDiff()
    if (diff == null) return

    await createTx.mutateAsync({
      type: diff > 0 ? 'income' : 'expense',
      cents: Math.abs(diff),
      occurredOn: format(new Date(), 'yyyy-MM-dd'),
      categoryId: null,
      description: 'Ajuste de saldo',
      isAdjustment: true,
    })
    onClose()
  }

  function handleRegisterInstead() {
    const diff = validateDiff()
    if (diff == null) return
    setRegisterPrompt({ type: diff > 0 ? 'income' : 'expense', cents: Math.abs(diff) })
  }

  return (
    <>
      <Dialog
        open={open && !registerPrompt}
        onClose={handleDialogClose}
        title="Cuadrar saldo"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={handleRegisterInstead} disabled={!hasAnyRow || createTx.isPending}>
              Registrar como movimiento
            </Button>
            <Button onClick={handleAdjustOnly} disabled={!hasAnyRow || createTx.isPending}>
              {createTx.isPending ? 'Ajustando…' : 'Sólo ajustar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="eyebrow">Saldo según MyFinances</p>
            {isBalancePending ? (
              <Skeleton className="mt-2 h-9 w-32" />
            ) : (
              <Money cents={currentBalanceCents ?? 0} tone="dim" size="figure" className="mt-1" />
            )}
          </div>

          <div>
            <p className="eyebrow mb-2">Dónde tenés la plata</p>
            {isLocationsPending ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(locations ?? []).map((location) => (
                  <LugarRow key={location.id} location={location} autoFocus={location.id === lastAddedLocationId} />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={handleAddLocation}
              disabled={createLocation.isPending}
              className="mt-2 text-[12px] font-medium text-acid hover:underline"
            >
              + Agregar lugar
            </button>
          </div>

          <div className="border-t border-ink-800 pt-5">
            <p className="eyebrow mb-2">Te deben</p>
            {isReceivablesPending ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              hasReceivables && (
                <div className="flex flex-col gap-2">
                  {(receivables ?? []).map((receivable) => (
                    <DeudaRow key={receivable.id} receivable={receivable} autoFocus={receivable.id === lastAddedReceivableId} />
                  ))}
                </div>
              )
            )}
            <button
              type="button"
              onClick={handleAddReceivable}
              disabled={createReceivable.isPending}
              className="mt-2 text-[12px] font-medium text-acid hover:underline"
            >
              + Agregar deuda
            </button>
            <p className="mt-2 text-[12px] text-chalk-faint">
              Al prestar no cargues un gasto: esa plata sigue siendo tuya. Cuando te paguen, borrá la fila y sumá el
              monto en el lugar donde entró.
            </p>
          </div>

          <dl className="space-y-2 border-t border-ink-800 pt-4 text-[13px]">
            {hasReceivables && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">En tus lugares</dt>
                  <dd>
                    <Money cents={rec.locationsCents} tone="dim" />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Te deben</dt>
                  <dd>
                    <Money cents={rec.receivablesCents} tone="acid" />
                  </dd>
                </div>
              </>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-chalk-faint">Tenés</dt>
              <dd>
                <Money cents={rec.totalCents} tone="dim" />
              </dd>
            </div>
            {hasAnyRow && !rec.cuadrado && (
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">Diferencia</dt>
                <dd>
                  <Money cents={rec.diffCents} tone={rec.diffCents < 0 ? 'coral' : 'acid'} signed />
                  {rec.diffCents < 0 ? ' de menos' : ' de más'}
                </dd>
              </div>
            )}
          </dl>

          {error && <p className="text-[12px] text-coral">{error}</p>}

          <p className="text-[12px] text-chalk-faint">
            "Sólo ajustar" crea el movimiento sin categoría, afuera de Análisis — para cuando no sabés
            de dónde salió la diferencia, o cuando cerrás el mes dejando todos los lugares en $0. Si
            sabés qué fue, "Registrar como movimiento" lo carga como un gasto o ingreso real, con
            categoría.
          </p>
        </div>
      </Dialog>

      {registerPrompt && (
        <TransactionFormDialog
          open={!!registerPrompt}
          onClose={() => {
            setRegisterPrompt(null)
            onClose()
          }}
          prefill={registerPrompt}
        />
      )}
    </>
  )
}
