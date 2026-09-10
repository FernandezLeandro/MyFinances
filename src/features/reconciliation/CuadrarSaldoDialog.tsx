import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'
import { Dialog } from '@/components/ui/Dialog'
import { DialogBottomBar, DialogSection, DialogSummaryBlock, type DialogStatus } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
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
    <div className="flex items-center gap-2 rounded-control px-1 py-1.5 transition-colors hover:bg-fill-subtle">
      <button type="button" onClick={onOpenDetail} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-fg">{receivable.name}</p>
          <p className="text-[12px] text-fg-muted">
            {receivable.expected_period
              ? format(parseISO(receivable.expected_period), 'MMM yyyy', { locale: es })
              : 'Sin fecha'}
          </p>
        </div>
        <Money cents={pendingCents} tone="accent" />
      </button>
      {onExpense && (
        <button type="button" onClick={onExpense} className="shrink-0 text-[11px] font-medium text-accent hover:underline">
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
  // Sólo una sección abierta a la vez (regla del acordeón arquetipo 4) — con estado por fila,
  // dejar que se acumulen estira el diálogo sin techo.
  const [openSection, setOpenSection] = useState<'cuentas' | 'deben' | 'sinAsignar' | null>(null)
  function toggleSection(section: 'cuentas' | 'deben' | 'sinAsignar') {
    setOpenSection((current) => (current === section ? null : section))
  }

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

  // Punto de estado + línea de contexto de "Tus cuentas": rojo si alguna no coincide con su
  // derivado, gris cuando todas coinciden (o no hay ninguna cargada todavía).
  const mismatchedAccounts = rec.perAccount.filter((a) => a.diffCents !== 0)
  let cuentasStatus: DialogStatus = 'neutral'
  let cuentasContext: string
  if (!hasLocations) {
    cuentasContext = 'Sin cuentas cargadas'
  } else if (mismatchedAccounts.length === 1) {
    cuentasStatus = 'alert'
    cuentasContext = `${activeLocations.find((l) => l.id === mismatchedAccounts[0].accountId)?.name || 'Una cuenta'} no coincide`
  } else if (mismatchedAccounts.length > 1) {
    cuentasStatus = 'alert'
    cuentasContext = `${mismatchedAccounts.length} cuentas no coinciden`
  } else {
    cuentasContext = 'Todas coinciden'
  }
  const matchedAccountsCount = activeLocations.length - mismatchedAccounts.length

  // "Te deben este mes": azul cuando suma algo a lo que tenés, gris cuando no hay nada pendiente.
  let debenStatus: DialogStatus = 'neutral'
  let debenContext: string
  if (receivablesEsteMes.length === 0) {
    debenContext = 'Nada pendiente este mes'
  } else {
    debenStatus = 'accent'
    const names = receivablesEsteMes.map((r) => r.receivable.name)
    const preview = names.length > 2 ? `${names.slice(0, 2).join(', ')} y ${names.length - 2} más` : names.join(', ')
    debenContext = `${preview} · suman a lo que tenés`
  }

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
        footerBleed
        footer={
          <DialogBottomBar
            label={rec.cuadrado ? undefined : rec.diffCents < 0 ? 'Te falta' : 'Te sobra'}
            figure={
              !rec.cuadrado && (
                <span
                  className={cn(
                    'tnum font-display text-2xl font-bold tracking-[-0.03em]',
                    rec.diffCents < 0 ? 'text-negative' : 'text-accent',
                  )}
                >
                  {formatMoney(Math.abs(rec.diffCents))}
                </span>
              )
            }
            action={
              <Button size="compact" onClick={handleAdjustOnly} disabled={!hasAnyRow || rec.cuadrado || createTx.isPending}>
                {createTx.isPending ? 'Ajustando…' : 'Sólo ajustar'}
              </Button>
            }
            secondary={
              !rec.cuadrado && (
                <button type="button" onClick={handleRegisterInstead} className="hover:underline">
                  …o <span className="font-medium text-accent">registrarlo como un gasto con categoría</span>.
                </button>
              )
            }
          />
        }
      >
        <div className="flex flex-col gap-2">
          {isBalancePending ? (
            <Skeleton className="h-[52px] w-full" />
          ) : (
            <DialogSummaryBlock
              title="Saldo según MyFinances"
              hint="Lo mismo que ves en Hoy"
              figure={formatMoney(currentBalanceCents ?? 0)}
            />
          )}

          {isLocationsPending ? (
            <Skeleton className="h-11 w-full" />
          ) : (
            <DialogSection
              title="Tus cuentas"
              status={cuentasStatus}
              context={cuentasContext}
              subtotal={formatMoney(rec.locationsCents)}
              open={openSection === 'cuentas'}
              onToggle={() => toggleSection('cuentas')}
              footer={
                hasLocations && (
                  <>
                    <span className="flex gap-3 text-[12px] font-medium text-accent">
                      <button type="button" onClick={() => setTransferOpen(true)} className="hover:underline">
                        Transferir
                      </button>
                      <button type="button" onClick={() => setCuentasManagerOpen(true)} className="hover:underline">
                        Administrar
                      </button>
                    </span>
                    <span className="text-[11.5px] text-fg-muted">
                      {matchedAccountsCount} de {activeLocations.length} coinciden
                    </span>
                  </>
                )
              }
            >
              {hasLocations ? (
                <div className="flex flex-col">
                  {activeLocations.map((location) => (
                    <CuentaRow
                      key={location.id}
                      location={location}
                      derivedCents={accountBalances?.get(location.id) ?? location.openingCents}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-[15px] py-3 text-[13px] text-fg-muted">
                  Todavía no cargaste ninguna cuenta.{' '}
                  <button type="button" onClick={() => setCuentasManagerOpen(true)} className="font-medium text-accent hover:underline">
                    Agregar la primera →
                  </button>
                </p>
              )}
            </DialogSection>
          )}

          <DialogSection
            title="Te deben este mes"
            status={debenStatus}
            context={debenContext}
            subtotal={formatMoney(rec.receivablesCents)}
            subtotalTone="accent"
            open={openSection === 'deben'}
            onToggle={() => toggleSection('deben')}
            footer={
              <button
                type="button"
                onClick={() => setReceivableFormOpen(true)}
                className="text-[12px] font-medium text-accent hover:underline"
              >
                + Agregar deuda
              </button>
            }
          >
            <div className="flex flex-col gap-3 px-[15px] py-3">
              {isReceivablesLoadingAny ? (
                <Skeleton className="h-10 w-full" />
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
              <p className="text-[12px] text-fg-muted">
                Acá sólo se muestran las que esperás cobrar este mes. Al prestar efectivo no cargues un
                gasto: esa plata sigue siendo tuya. Cuando te devuelvan, registrá el abono desde la deuda
                y sumá el monto en la cuenta donde entró.{' '}
                <Link to="/me-deben" className="font-medium text-accent hover:underline">
                  Ver todas en Me Deben →
                </Link>
              </p>
            </div>
          </DialogSection>

          {rec.sinAsignarCents !== 0 && (
            <DialogSection
              title="Sin asignar"
              status="neutral"
              context="Movimientos sin cuenta"
              subtotal={formatMoney(rec.sinAsignarCents)}
              open={openSection === 'sinAsignar'}
              onToggle={() => toggleSection('sinAsignar')}
            >
              <p className="px-[15px] py-3 text-[12px] text-fg-muted">
                Plata que el saldo ya cuenta pero no está imputada a ninguna cuenta — movimientos
                cargados sin elegir con qué se pagaron.{' '}
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
                  className="font-medium text-accent hover:underline"
                >
                  Ver esos movimientos →
                </Link>
              </p>
            </DialogSection>
          )}

          {hasAnyRow && !rec.cuadrado && activeLocations.length > 0 && (
            <div className="pt-3">
              <p className="eyebrow mb-2">Imputar el ajuste a</p>
              <AccountSelect value={adjustAccountId} onChange={setAdjustAccountId} emptyLabel="Sin cuenta (como antes)" />
            </div>
          )}

          {error && <p className="pt-1 text-[12px] text-negative">{error}</p>}
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
