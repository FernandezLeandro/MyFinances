import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'
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
  useDeleteBalanceLocation,
  useUpdateBalanceLocation,
  type BalanceLocation,
} from '@/features/reconciliation/api'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { summarizeReceivables, type ReceivableSummary } from '@/features/receivables/aggregate'
import { ReceivableFormDialog } from '@/features/receivables/ReceivableFormDialog'
import { ReceivableDetailDialog } from '@/features/receivables/ReceivableDetailDialog'
import { reconciliar } from '@/features/reconciliation/aggregate'

interface CuadrarSaldoDialogProps {
  open: boolean
  onClose: () => void
}

/** Fila editable de nombre + monto, sin "Guardar" aparte: cada campo persiste solo al perder foco.
 *  Sólo la usa `LugarRow` — las deudas dejaron de editarse acá (ver el comentario del componente
 *  principal, más abajo, sobre por qué). */
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

/** Fila de deuda, read-only: a diferencia de `LugarRow`, acá el "monto" es lo pendiente — un
 *  derivado de total menos abonos — y no hay dónde escribirlo directo sin contradecir en silencio
 *  los abonos ya registrados. Tocarla abre el detalle completo (editar, ver abonos, registrar uno
 *  nuevo). */
function DeudaRow({ summary, onOpenDetail }: { summary: ReceivableSummary; onOpenDetail: () => void }) {
  const { receivable, pendingCents } = summary
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex items-center gap-3 rounded-control px-1 py-1.5 text-left transition-colors hover:bg-ink-850"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-chalk">{receivable.name}</p>
        <p className="text-[12px] text-chalk-faint">
          {receivable.expected_period
            ? format(parseISO(receivable.expected_period), 'MMM yyyy', { locale: es })
            : 'Sin fecha'}
        </p>
      </div>
      <Money cents={pendingCents} tone="acid" />
    </button>
  )
}

/**
 * Reemplaza al viejo "Ajustar saldo" de un solo campo: acá se desglosa dónde está la plata
 * (efectivo, cada plataforma) en vez de tener que sumarlo de memoria antes de escribir un único
 * número. La comparación sigue siendo contra `useCurrentBalance` — el mismo dato del héroe de Hoy —
 * y las dos salidas (ajustar directo / registrar como movimiento) son las que ya existían.
 *
 * "Te deben" suma del lado de "Tenés" — pero sólo lo que todavía cuenta como plata tuya (ver
 * `ReceivableSummary.cuentaEnCuadre`): prestar efectivo no genera un movimiento (no es un gasto, va
 * a volver), así que `rpc_current_balance` ya la cuenta. Las deudas con "ya lo cargué como gasto" NO
 * suman acá — esa plata ya salió del saldo cuando se cargó el gasto real, y sumarla otra vez
 * marcaría un excedente falso — se muestran aparte, atenuadas, para que no parezca que la app se
 * las comió. Ver el comentario de la migración `receivables_deudas_a_favor` para el porqué completo.
 *
 * Las deudas dejaron de editarse inline acá (a diferencia de los lugares): con abonos parciales,
 * el "monto" de una fila es ambiguo — si es el total, tocarlo contradice en silencio los abonos ya
 * registrados; si es lo pendiente, no hay dónde escribirlo, es derivado. El botón "+ Agregar deuda"
 * sigue en el mismo lugar, pero abre el alta completa (`ReceivableFormDialog`) en vez de crear una
 * fila vacía — la captura rápida se mantiene, sólo que con un campo más para completar.
 *
 * Sin diálogos anidados para el flujo principal de lugares: cada fila se edita y persiste sola
 * (`onBlur`), sin un "Guardar" aparte. Las deudas SÍ anidan (alta, detalle, "Registrar como
 * movimiento"), con el mismo guard de `open && !anidado` que ya usaba este diálogo antes de este
 * cambio, ahora con tres banderas en vez de una.
 */
export function CuadrarSaldoDialog({ open, onClose }: CuadrarSaldoDialogProps) {
  const { data: currentBalanceCents, isPending: isBalancePending } = useCurrentBalance()
  const { data: locations, isPending: isLocationsPending } = useBalanceLocations()
  const { data: receivables, isPending: isReceivablesPending } = useReceivables()
  const { data: receivablePayments, isPending: isPaymentsPending } = useReceivablePayments()
  const createLocation = useCreateBalanceLocation()
  const createTx = useCreateTransaction()
  const [registerPrompt, setRegisterPrompt] = useState<{ type: TransactionType; cents: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastAddedLocationId, setLastAddedLocationId] = useState<string | null>(null)
  const [receivableFormOpen, setReceivableFormOpen] = useState(false)
  const [detailSummary, setDetailSummary] = useState<ReceivableSummary | null>(null)

  const isReceivablesLoadingAny = isReceivablesPending || isPaymentsPending
  const receivablesSummary = useMemo(
    () => summarizeReceivables(receivables ?? [], receivablePayments ?? [], new Date()),
    [receivables, receivablePayments],
  )
  // `reconciliar` filtra por `cuentaEnCuadre` puertas adentro — se le pasan todas (pendientes y
  // cobradas), así el contrato no depende de qué lista exacta le mandaste.
  const allReceivableSummaries = useMemo(
    () => [...receivablesSummary.pendientes, ...receivablesSummary.cobradas],
    [receivablesSummary],
  )
  const rec = useMemo(
    () => reconciliar(locations ?? [], allReceivableSummaries, currentBalanceCents ?? 0),
    [locations, allReceivableSummaries, currentBalanceCents],
  )
  // Las pendientes ya filtran `!cobrada`, así que "ya la cargué como gasto" alcanza para separar
  // las que suman (normalReceivables) de las que no (expensedReceivables) — ver el comentario de
  // cabecera de este componente.
  const normalReceivables = receivablesSummary.pendientes.filter((r) => !r.receivable.already_expensed)
  const expensedReceivables = receivablesSummary.pendientes.filter((r) => r.receivable.already_expensed)

  const hasLocations = (locations ?? []).length > 0
  const hasReceivables = normalReceivables.length > 0 || expensedReceivables.length > 0
  const hasAnyRow = hasLocations || hasReceivables

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir el alta de movimiento o de deuda encima, o el detalle
  // de una deuda). Sin este filtro, pasar a cualquiera de esos tres cerraba todo el flujo de un
  // tirón.
  function handleDialogClose() {
    if (!registerPrompt && !receivableFormOpen && !detailSummary) onClose()
  }

  async function handleAddLocation() {
    setError(null)
    const created = await createLocation.mutateAsync({ name: '', cents: 0 })
    setLastAddedLocationId(created.id)
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
        open={open && !registerPrompt && !receivableFormOpen && !detailSummary}
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
            {isReceivablesLoadingAny ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              normalReceivables.length > 0 && (
                <div className="flex flex-col gap-1">
                  {normalReceivables.map((item) => (
                    <DeudaRow key={item.receivable.id} summary={item} onOpenDetail={() => setDetailSummary(item)} />
                  ))}
                </div>
              )
            )}
            <button
              type="button"
              onClick={() => setReceivableFormOpen(true)}
              className="mt-2 text-[12px] font-medium text-acid hover:underline"
            >
              + Agregar deuda
            </button>

            {expensedReceivables.length > 0 && (
              <div className="mt-4 border-t border-ink-850 pt-3">
                <p className="eyebrow mb-2">Ya lo cargaste como gasto</p>
                <div className="flex flex-col gap-1 opacity-60">
                  {expensedReceivables.map((item) => (
                    <DeudaRow key={item.receivable.id} summary={item} onOpenDetail={() => setDetailSummary(item)} />
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-chalk-faint">
                  Esta plata ya salió del saldo cuando registraste el gasto, así que no suma acá.
                </p>
              </div>
            )}

            <p className="mt-3 text-[12px] text-chalk-faint">
              Al prestar efectivo no cargues un gasto: esa plata sigue siendo tuya. Cuando te devuelvan,
              registrá el abono desde la deuda y sumá el monto en el lugar donde entró.{' '}
              <Link to="/deudas" className="font-medium text-acid hover:underline">
                Ver todas en Deudas →
              </Link>
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
                {rec.expensedPendingCents > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-chalk-faint">Ya lo cargaste como gasto</dt>
                    <dd>
                      <Money cents={rec.expensedPendingCents} tone="dim" />
                    </dd>
                  </div>
                )}
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

      {receivableFormOpen && (
        <ReceivableFormDialog
          open={receivableFormOpen}
          onClose={() => setReceivableFormOpen(false)}
          defaultAlreadyExpensed={false}
        />
      )}

      {detailSummary && (
        <ReceivableDetailDialog open={!!detailSummary} onClose={() => setDetailSummary(null)} summary={detailSummary} />
      )}
    </>
  )
}
