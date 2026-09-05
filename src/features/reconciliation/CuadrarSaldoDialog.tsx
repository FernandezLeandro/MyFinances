import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { UNASSIGNED_ACCOUNT_ID, useCreateTransaction, useCurrentBalance, type TransactionType } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { useAccountBalances, useBalanceLocations, type BalanceLocation } from '@/features/reconciliation/api'
import { CuentaRow } from '@/features/reconciliation/CuentaRow'
import { CuentasManagerDialog } from '@/features/accounts/CuentasManagerDialog'
import { TransferDialog } from '@/features/accounts/TransferDialog'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { particionarPorHorizonte, summarizeReceivables, type ReceivableSummary } from '@/features/receivables/aggregate'
import { ReceivableFormDialog } from '@/features/receivables/ReceivableFormDialog'
import { ReceivableDetailDialog } from '@/features/receivables/ReceivableDetailDialog'
import { ExpenseReceivableDialog } from '@/features/receivables/ExpenseReceivableDialog'
import { reconciliar } from '@/features/reconciliation/aggregate'

interface CuadrarSaldoDialogProps {
  open: boolean
  onClose: () => void
}

/** Fila de deuda: a diferencia de `CuentaRow`, acá el "monto" es lo pendiente — un derivado de total
 *  menos abonos — y no hay dónde escribirlo directo sin contradecir en silencio los abonos ya
 *  registrados. Tocar el nombre abre el detalle completo (editar, ver abonos, registrar uno nuevo);
 *  "Descontar" es la salida real para sacarla de esta lista sin descuadrar nada (ver el comentario
 *  de cabecera del diálogo). Dos elementos hermanos, no un botón anidado dentro de otro. */
function DeudaRow({
  summary,
  onOpenDetail,
  onExpense,
}: {
  summary: ReceivableSummary
  onOpenDetail: () => void
  /** Ausente cuando no tiene sentido descontar de nuevo (p.ej. ya está `already_expensed`). */
  onExpense?: () => void
}) {
  const { receivable, pendingCents } = summary
  return (
    <div className="flex items-center gap-2 rounded-control px-1 py-1.5 transition-colors hover:bg-ink-850">
      <button type="button" onClick={onOpenDetail} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
      {onExpense && (
        <button type="button" onClick={onExpense} className="shrink-0 text-[11px] font-medium text-acid hover:underline">
          Descontar
        </button>
      )}
    </div>
  )
}

/**
 * Declara "cuánto tenés realmente" cuenta por cuenta (efectivo, cada plataforma) y genera el ajuste
 * si no coincide con lo que sabe la app. La comparación sigue siendo contra `useCurrentBalance` — el
 * mismo dato del héroe de Hoy — y las dos salidas (ajustar directo / registrar como movimiento) son
 * las que ya existían.
 *
 * Desde que existen las cuentas (`account_id` en los movimientos), cada `CuentaRow` también muestra
 * un derivado — "Según la app" — que es puramente DIAGNÓSTICO: te dice en qué cuenta podría estar el
 * descuadre. El AJUSTE sigue siendo global (`rec.diffCents`), nunca por cuenta: prestar efectivo no
 * genera movimiento, así que el derivado de esa cuenta queda por encima del real sin que haya ningún
 * error que corregir ahí — cuadrar por cuenta fabricaría un ajuste falso en cada préstamo. Ver el
 * comentario de cabecera de `reconciliar()`.
 *
 * "Te deben" suma del lado de "Tenés" — pero sólo lo que todavía cuenta como plata tuya (ver
 * `ReceivableSummary.cuentaEnCuadre`): prestar efectivo no genera un movimiento (no es un gasto, va
 * a volver), así que `rpc_current_balance` ya la cuenta. Las deudas con "ya lo cargué como gasto" NO
 * suman acá — esa plata ya salió del saldo cuando se cargó el gasto real, y sumarla otra vez
 * marcaría un excedente falso. Ver el comentario de la migración `receivables_deudas_a_favor` para
 * el porqué completo.
 *
 * Esta pantalla sólo LISTA lo que espera cobrarse este mes (`particionarPorHorizonte`, filtrado a
 * `esteMes`) y nunca las `already_expensed` — son plata que vuelve en un tiempo indeterminado y el
 * usuario prefiere gestionarlas desde Me Deben, no acá. Ese filtro es sólo de presentación: la suma
 * de `rec` sigue contando TODO lo que `cuentaEnCuadre`, esté o no visible en esta lista — ver el
 * comentario junto a `normalReceivables`/`receivablesEsteMes` más abajo.
 *
 * Las deudas dejaron de editarse inline acá (a diferencia de las cuentas): con abonos parciales,
 * el "monto" de una fila es ambiguo — si es el total, tocarlo contradice en silencio los abonos ya
 * registrados; si es lo pendiente, no hay dónde escribirlo, es derivado. El botón "+ Agregar deuda"
 * sigue en el mismo lugar, pero abre el alta completa (`ReceivableFormDialog`) en vez de crear una
 * fila vacía — la captura rápida se mantiene, sólo que con un campo más para completar.
 *
 * Sin diálogos anidados para el flujo principal de cuentas: cada fila se edita y persiste sola
 * (`onBlur`), sin un "Guardar" aparte — crear/tipar/archivar una cuenta vive en
 * `CuentasManagerDialog`. Las deudas SÍ anidan (alta, detalle, "Registrar como movimiento"), con el
 * mismo guard de `open && !anidado` que ya usaba este diálogo, ahora con seis banderas en vez de una.
 */
export function CuadrarSaldoDialog({ open, onClose }: CuadrarSaldoDialogProps) {
  const { data: currentBalanceCents, isPending: isBalancePending } = useCurrentBalance()
  const { data: locations, isPending: isLocationsPending } = useBalanceLocations()
  const { data: accountBalances } = useAccountBalances()
  const { data: receivables, isPending: isReceivablesPending } = useReceivables()
  const { data: receivablePayments, isPending: isPaymentsPending } = useReceivablePayments()
  const createTx = useCreateTransaction()
  const [registerPrompt, setRegisterPrompt] = useState<{ type: TransactionType; cents: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receivableFormOpen, setReceivableFormOpen] = useState(false)
  const [cuentasManagerOpen, setCuentasManagerOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [adjustAccountId, setAdjustAccountId] = useState('')
  // Ids, no el objeto: `receivablesSummary` se recalcula en cada render con datos frescos de la
  // query, pero un `ReceivableSummary` guardado tal cual en el estado queda pegado al momento del
  // click — después de pagar/descontar, el detalle seguía mostrando el estado de antes y dejaba
  // repetir la acción porque renderizaba ese objeto viejo en vez de volver a buscarlo. Derivar por
  // id en cada render lo evita (mismo fix que en `MeDeben.tsx`).
  const [detailId, setDetailId] = useState<string | null>(null)
  const [expenseId, setExpenseId] = useState<string | null>(null)

  const activeLocations = useMemo(() => (locations ?? []).filter((l: BalanceLocation) => !l.is_archived), [locations])

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
    () => reconciliar(activeLocations, allReceivableSummaries, currentBalanceCents ?? 0, accountBalances),
    [activeLocations, allReceivableSummaries, currentBalanceCents, accountBalances],
  )
  const detailSummary = useMemo(
    () => allReceivableSummaries.find((s) => s.receivable.id === detailId) ?? null,
    [allReceivableSummaries, detailId],
  )
  const expenseSummary = useMemo(
    () => allReceivableSummaries.find((s) => s.receivable.id === expenseId) ?? null,
    [allReceivableSummaries, expenseId],
  )
  // Las pendientes ya filtran `!cobrada`; "ya la cargué como gasto" alcanza para sacar del todo esas
  // deudas de esta pantalla — son plata que vuelve en un tiempo indeterminado y el usuario prefiere
  // gestionarlas desde Me Deben. Siguen sumando en `rec` de todos modos vía `allReceivableSummaries`
  // de arriba (`cuentaEnCuadre` las excluye solo si `already_expensed`, que es justamente 0 acá) —
  // ver el comentario de cabecera de este componente.
  const normalReceivables = receivablesSummary.pendientes.filter((r) => !r.receivable.already_expensed)
  // Partición sólo de presentación: acá sólo importa "entra este mes" — lo demás (sin fecha o más
  // adelante) no se muestra en absoluto en esta pantalla. Sigue sumando en `rec.receivablesCents` y
  // en "Tenés" de más abajo igual: sacar una deuda de la SUMA (no sólo de la vista) fabricaría un
  // faltante falso que empujaría a un ajuste que no existe. Ver el comentario de
  // `particionarPorHorizonte`.
  const { esteMes: receivablesEsteMes } = useMemo(
    () => particionarPorHorizonte(normalReceivables, new Date()),
    [normalReceivables],
  )

  const hasLocations = activeLocations.length > 0
  const hasReceivables = normalReceivables.length > 0
  const hasAnyRow = hasLocations || hasReceivables

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir el alta de movimiento o de deuda encima, el detalle de
  // una deuda, "Descontar", o los diálogos de cuentas/transferencias). Sin este filtro, pasar a
  // cualquiera de esos seis cerraba todo el flujo de un tirón.
  const anyNestedOpen =
    !!registerPrompt || receivableFormOpen || !!detailSummary || !!expenseSummary || cuentasManagerOpen || transferOpen

  function handleDialogClose() {
    if (!anyNestedOpen) onClose()
  }

  function validateDiff(): number | null {
    if (!hasAnyRow) {
      setError('Cargá al menos una cuenta o una deuda')
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
      accountId: adjustAccountId || null,
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
        open={open && !anyNestedOpen}
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
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">Tus cuentas</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTransferOpen(true)}
                  className="text-[12px] font-medium text-acid hover:underline"
                >
                  Transferir
                </button>
                <button
                  type="button"
                  onClick={() => setCuentasManagerOpen(true)}
                  className="text-[12px] font-medium text-acid hover:underline"
                >
                  Administrar
                </button>
              </div>
            </div>
            {isLocationsPending ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : activeLocations.length === 0 ? (
              <p className="text-[13px] text-chalk-faint">
                Todavía no cargaste ninguna cuenta.{' '}
                <button type="button" onClick={() => setCuentasManagerOpen(true)} className="font-medium text-acid hover:underline">
                  Agregar la primera →
                </button>
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {activeLocations.map((location) => (
                  <CuentaRow
                    key={location.id}
                    location={location}
                    derivedCents={accountBalances?.get(location.id) ?? location.openingCents}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-ink-800 pt-5">
            <p className="eyebrow mb-2">Te deben</p>
            {isReceivablesLoadingAny ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              receivablesEsteMes.length > 0 && (
                <div className="flex flex-col gap-1">
                  {receivablesEsteMes.map((item) => (
                    <DeudaRow
                      key={item.receivable.id}
                      summary={item}
                      onOpenDetail={() => setDetailId(item.receivable.id)}
                      onExpense={() => setExpenseId(item.receivable.id)}
                    />
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

            <p className="mt-3 text-[12px] text-chalk-faint">
              Acá sólo se muestran las que esperás cobrar este mes. Al prestar efectivo no cargues un
              gasto: esa plata sigue siendo tuya. Cuando te devuelvan, registrá el abono desde la deuda
              y sumá el monto en la cuenta donde entró.{' '}
              <Link to="/me-deben" className="font-medium text-acid hover:underline">
                Ver todas en Me Deben →
              </Link>
            </p>
          </div>

          <dl className="space-y-2 border-t border-ink-800 pt-4 text-[13px]">
            {hasReceivables && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">En tus cuentas</dt>
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
            {rec.sinAsignarCents !== 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">
                  Sin asignar ·{' '}
                  {/* Antes mandaba a Movimientos sin ningún filtro — un `<Link to="/movimientos">`
                      a secas caía en "este mes" (el período por defecto) sin filtrar por cuenta,
                      así que en la práctica nunca mostraba estos movimientos. Con `state`, "Sin
                      cuenta" ya viene marcado y el período es todo el historial, no sólo el mes
                      actual — se ven sin importar cuándo se cargaron. */}
                  <Link
                    to="/movimientos"
                    state={{
                      accountIds: [UNASSIGNED_ACCOUNT_ID],
                      period: { preset: 'custom', anchor: format(new Date(), 'yyyy-MM-dd'), from: '2000-01-01', to: format(new Date(), 'yyyy-MM-dd') },
                    }}
                    className="underline"
                  >
                    ver
                  </Link>
                </dt>
                <dd>
                  <Money cents={rec.sinAsignarCents} tone="dim" />
                </dd>
              </div>
            )}
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

          {hasAnyRow && !rec.cuadrado && activeLocations.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Imputar el ajuste a</p>
              <AccountSelect value={adjustAccountId} onChange={setAdjustAccountId} emptyLabel="Sin cuenta (como antes)" />
            </div>
          )}

          {error && <p className="text-[12px] text-coral">{error}</p>}

          <p className="text-[12px] text-chalk-faint">
            "Sólo ajustar" crea el movimiento sin categoría, afuera de Análisis — para cuando no sabés
            de dónde salió la diferencia, o cuando cerrás el mes dejando todas las cuentas en $0. Si
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
        <ReceivableDetailDialog open={!!detailSummary} onClose={() => setDetailId(null)} summary={detailSummary} />
      )}

      {expenseSummary && (
        <ExpenseReceivableDialog open={!!expenseSummary} onClose={() => setExpenseId(null)} summary={expenseSummary} />
      )}

      {cuentasManagerOpen && (
        <CuentasManagerDialog open={cuentasManagerOpen} onClose={() => setCuentasManagerOpen(false)} />
      )}

      {transferOpen && <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />}
    </>
  )
}
