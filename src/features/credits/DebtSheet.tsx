import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { format, getDate, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Plus, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { IconSquare } from '@/components/ui/IconSquare'
import { CountUpMoney, Money } from '@/components/ui/Money'
import { StackedBar } from '@/components/ui/StackedBar'
import { DialogConfirmStack, DialogEmptyNote } from '@/components/ui/dialog-parts'
import { Field, AmountInput } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { EASE_OUT_QUINT, ROW_PRESENCE } from '@/lib/motion'
import { centsToInputText, formatMoney, MAX_AMOUNT_CENTS, parseAmountToCents } from '@/lib/money'
import { useCan } from '@/features/access/useCan'
import { AccountField } from '@/features/accounts/AccountField'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'
import { useCategories, type Category } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import {
  useAddCreditSaving,
  useCreditPurchases,
  useMarkCreditCardPaid,
  useMarkCreditPurchasePaid,
  useRemoveCreditSaving,
  useUnmarkCreditCardPaid,
  useUnmarkCreditPurchasePaid,
  type CreditCard,
  type CreditPurchase,
} from '@/features/credits/api'
import { debtItems, debtName, paymentGroups, type Debt, type SavedInstallment } from '@/features/credits/aggregate'
import { etiquetaCuota } from '@/features/credits/format'
import { CreditCardFormDialog } from '@/features/credits/CreditCardFormDialog'
import { PurchaseFormDialog } from '@/features/credits/PurchaseFormDialog'

interface DebtSheetProps {
  open: boolean
  onClose: () => void
  debt: Debt
  /** Todas las tarjetas — para el alta de una compra desde el panel de una tarjeta. */
  cards: CreditCard[]
  /** Período de una tarjeta sin cuotas este ciclo (no hay ítem del que sacarlo). */
  fallbackPeriod: string
}

type View = 'list' | 'pay'
type Child = { kind: 'editCard' } | { kind: 'purchase'; purchase: CreditPurchase | null } | null

/**
 * El panel de una deuda (tarjeta o compra sin tarjeta) en el ciclo — rediseño de Mis Deudas: todo
 * pasa acá adentro, sin diálogos encadenados. Guardar se despliega en la fila de la compra; pagar es
 * una segunda vista del mismo panel (patrón de vistas de `TransactionFiltersDialog`). Sólo editar la
 * tarjeta o una compra abre un formulario aparte, con el patrón de hijo de siempre (`open && !child`,
 * el hijo montado como hermano): sin eso, abrirlo cerraría este panel de un tirón.
 */
export function DebtSheet({ open, onClose, debt, cards, fallbackPeriod }: DebtSheetProps) {
  const [view, setView] = useState<View>('list')
  const [child, setChild] = useState<Child>(null)
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [accountId, setAccountId] = useDefaultAccountId()
  const picker = useAccountPicker()
  const submittingRef = useRef(false)

  const { data: categories } = useCategories(true)
  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  // Para editar una compra de la tarjeta desde su fila: el ítem del período no trae la fila completa.
  const { data: cardPurchases } = useCreditPurchases(debt.kind === 'card' ? debt.summary.card.id : null)

  const markCardPaid = useMarkCreditCardPaid()
  const markPurchasePaid = useMarkCreditPurchasePaid()
  const unmarkCardPaid = useUnmarkCreditCardPaid()
  const unmarkPurchasePaid = useUnmarkCreditPurchasePaid()

  const name = debtName(debt)
  const items = debtItems(debt)
  const { totalCents, savedCents, savedPercent, pendingCents, missingCents, paid } = debt.summary
  const period = items[0]?.period ?? fallbackPeriod
  const hasDue = items.length > 0
  const dueDay = debt.kind === 'card' ? debt.summary.card.due_day : debt.summary.purchase.due_day
  const dueOn = debt.summary.dueOn
  const dueLabel = dueDay == null ? 'Sin vencimiento' : `Vence el ${dueOn ? getDate(parseISO(dueOn)) : dueDay}`

  const pay = paymentGroups(items)
  const showAccount = picker.show && pendingCents > 0
  const payPending = markCardPaid.isPending || markPurchasePaid.isPending

  function handleClose() {
    if (child === null) onClose()
  }

  function confirmPay() {
    if (submittingRef.current) return
    submittingRef.current = true
    const options = {
      onSuccess: () => setView('list'),
      onSettled: () => {
        submittingRef.current = false
      },
    }
    if (debt.kind === 'card') {
      markCardPaid.mutate({ cardId: debt.summary.card.id, period, accountId: accountId || null }, options)
    } else {
      markPurchasePaid.mutate({ purchaseId: debt.summary.purchase.id, period, accountId: accountId || null }, options)
    }
  }

  function undoPay() {
    if (debt.kind === 'card') unmarkCardPaid.mutate({ cardId: debt.summary.card.id, period })
    else unmarkPurchasePaid.mutate({ purchaseId: debt.summary.purchase.id, period })
  }

  function editItem(item: SavedInstallment) {
    const purchase = debt.kind === 'purchase' ? debt.summary.purchase : cardPurchases?.find((p) => p.id === item.purchase_id)
    if (purchase) setChild({ kind: 'purchase', purchase })
  }

  const listFooter = paid ? (
    <Button
      variant="ghost"
      size="dialogFooter"
      onClick={undoPay}
      disabled={unmarkCardPaid.isPending || unmarkPurchasePaid.isPending}
      className="sm:h-[52px]! sm:w-full! text-negative! hover:text-negative!"
    >
      Deshacer pago
    </Button>
  ) : hasDue ? (
    <Button size="dialogFooter" className="sm:h-[52px]! sm:w-full!" onClick={() => setView('pay')}>
      {pendingCents > 0 ? `Pagar ${formatMoney(pendingCents)}` : 'Marcar pagada'}
    </Button>
  ) : undefined

  return (
    <>
      <Dialog
        open={open && child === null}
        onClose={handleClose}
        title={view === 'pay' ? `Pagar ${name}` : name}
        subtitle={view === 'list' ? (paid ? 'Pagada este ciclo' : dueLabel) : undefined}
        onBack={view === 'pay' ? () => setView('list') : undefined}
        footer={
          view === 'pay' ? (
            <DialogConfirmStack
              tone="primary"
              confirmLabel={pendingCents > 0 ? `Pagar ${formatMoney(pendingCents)}` : 'Marcar pagada'}
              pendingLabel="Guardando…"
              pending={payPending}
              disabled={showAccount && !accountId}
              onConfirm={confirmPay}
              onCancel={() => setView('list')}
            />
          ) : (
            listFooter
          )
        }
      >
        {/* Ir a pagar desliza desde la derecha y volver, desde la izquierda — sólo la entrada (180ms),
            mismos valores que las vistas de Filtros en Movimientos. */}
        <m.div
          key={view}
          initial={{ opacity: 0, transform: `translateX(${view === 'pay' ? 12 : -12}px)` }}
          animate={{ opacity: 1, transform: 'translateX(0px)' }}
          transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
        >
          {view === 'list' ? (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="eyebrow">{paid ? 'Pagado' : 'A pagar'}</p>
                  <button
                    type="button"
                    onClick={() => setChild(debt.kind === 'card' ? { kind: 'editCard' } : { kind: 'purchase', purchase: debt.summary.purchase })}
                    className="text-[12.5px] font-semibold text-accent-text hover:underline"
                  >
                    {debt.kind === 'card' ? 'Editar tarjeta' : 'Editar compra'}
                  </button>
                </div>
                <CountUpMoney cents={totalCents} tone={paid ? 'dim' : 'fg'} size="figure" className="mt-1" />
                {!paid && totalCents > 0 && (
                  <>
                    {/* Un solo segmento: todo lo guardado descuenta del pago (ver el hero de MisDeudas). */}
                    <StackedBar thin className="mt-3" segments={[{ pct: savedPercent, color: 'var(--color-accent)' }]} />
                    <p className="mt-2 text-[12.5px] text-fg-muted">
                      {savedCents === 0 ? (
                        'Todavía no guardaste nada.'
                      ) : (
                        <>
                          Guardaste <Money cents={savedCents} tone="dim" size="inline" />
                          {missingCents > 0 ? (
                            <>
                              {' '}
                              · faltan <Money cents={missingCents} tone="dim" size="inline" />
                            </>
                          ) : (
                            ' · ya está cubierta'
                          )}
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="eyebrow">{debt.kind === 'card' ? 'Compras del ciclo' : 'Cuota del ciclo'}</p>
                  {debt.kind === 'card' && (
                    <button
                      type="button"
                      onClick={() => setChild({ kind: 'purchase', purchase: null })}
                      className="text-[12.5px] font-semibold text-accent-text hover:underline"
                    >
                      Nueva compra
                    </button>
                  )}
                </div>
                {items.length === 0 ? (
                  <div className="mt-3">
                    <DialogEmptyNote>Sin cuotas este ciclo.</DialogEmptyNote>
                  </div>
                ) : (
                  <ul className="-mx-panel mt-1">
                    {items.map((item) => (
                      <ItemRow
                        key={`${item.purchase_id}-${item.period}`}
                        item={item}
                        category={categoryById.get(item.category_id ?? '')}
                        paid={paid}
                        open={savingFor === item.purchase_id}
                        onToggle={() => setSavingFor((cur) => (cur === item.purchase_id ? null : item.purchase_id))}
                        onEdit={() => editItem(item)}
                        accountId={accountId}
                        onAccountChange={setAccountId}
                        showAccountPicker={picker.show}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <p className="eyebrow">{pendingCents > 0 ? 'Se va a pagar' : 'Ya está todo guardado'}</p>
                <Money cents={pendingCents} size="figure" className="mt-1" />
                {pendingCents < totalCents && (
                  <p className="mt-2 text-[12.5px] text-fg-muted">
                    De <Money cents={totalCents} tone="dim" size="inline" />, ya guardaste{' '}
                    <Money cents={totalCents - pendingCents} tone="dim" size="inline" />.
                  </p>
                )}
              </div>

              {pay.groups.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {pay.groups.map((group) => {
                    const category = categoryById.get(group.categoryId ?? '')
                    return (
                      <div key={group.categoryId ?? 'sin-categoria'} className="rounded-control bg-surface-sunken px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-fg">
                            <CategoryChip {...chipLook(category)} size={20} />
                            <span className="truncate">{category?.name ?? 'Sin categoría'}</span>
                          </span>
                          <Money cents={group.totalCents} size="inline" />
                        </div>
                        <ul className="mt-2 flex flex-col gap-1">
                          {group.items.map((item) => (
                            <li key={item.purchase_id} className="flex items-start justify-between gap-3 text-[12px] text-fg-muted">
                              <span className="min-w-0 break-words">
                                {item.description} {etiquetaCuota(item.installment_no, item.installments)}
                                {item.savedCents > 0 && ' · resto'}
                              </span>
                              <Money cents={item.pendingCents} tone="dim" size="inline" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="text-[12.5px] text-fg-muted">
                {pay.groups.length === 0
                  ? 'No se genera ningún movimiento: ya está todo guardado. Sólo se marca pagada.'
                  : debt.kind === 'purchase'
                    ? 'Se va a generar un movimiento con este importe.'
                    : pay.groups.length > 1
                      ? `Se van a generar ${pay.groups.length} movimientos, uno por categoría, con el detalle de las compras en la descripción.`
                      : 'Se va a generar un movimiento con el detalle de las compras en la descripción.'}
              </p>

              {pay.covered.length > 0 && debt.kind === 'card' && (
                <div>
                  <p className="eyebrow">Ya guardadas</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {pay.covered.map((item) => (
                      <li key={item.purchase_id} className="flex items-start gap-2 text-[12px] text-fg-muted">
                        <Check className="mt-0.5 size-3 shrink-0 text-accent" strokeWidth={2} aria-hidden />
                        <span className="min-w-0 break-words">
                          {item.description} {etiquetaCuota(item.installment_no, item.installments)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {showAccount && (
                <AccountField label="Con qué lo pagás" accountId={accountId} onChange={setAccountId} deltaCents={-pendingCents} />
              )}
            </div>
          )}
        </m.div>
      </Dialog>

      {child?.kind === 'editCard' && debt.kind === 'card' && (
        <CreditCardFormDialog open onClose={() => setChild(null)} card={debt.summary.card} onDeleted={onClose} />
      )}
      {child?.kind === 'purchase' && (
        <PurchaseFormDialog
          open
          onClose={() => setChild(null)}
          cards={cards}
          purchase={child.purchase}
          defaultCardId={debt.kind === 'card' ? debt.summary.card.id : undefined}
          // Borrar la única compra de un panel de compra suelta deja el panel vacío: se cierra todo.
          onDeleted={debt.kind === 'purchase' ? onClose : () => setChild(null)}
        />
      )}
    </>
  )
}

function ItemRow({
  item,
  category,
  paid,
  open,
  onToggle,
  onEdit,
  accountId,
  onAccountChange,
  showAccountPicker,
}: {
  item: SavedInstallment
  category: Category | undefined
  paid: boolean
  open: boolean
  onToggle: () => void
  onEdit: () => void
  accountId: string
  onAccountChange: (id: string) => void
  showAccountPicker: boolean
}) {
  const covered = item.savedCents >= item.amountCents
  const label = `${item.description} ${etiquetaCuota(item.installment_no, item.installments)}`.trim()

  return (
    <li className="border-t border-divider first:border-t-0">
      <div className="flex min-w-0 items-center gap-3 px-panel py-3">
        {!paid && (
          <IconSquare active={covered} onClick={onToggle} aria-expanded={open} aria-label={`${label}: guardar plata`}>
            {covered ? <Check className="size-2.5" strokeWidth={1.8} aria-hidden /> : <Plus className="size-2.5" strokeWidth={1.8} aria-hidden />}
          </IconSquare>
        )}
        <button type="button" onClick={onEdit} aria-label={`${label}: editar`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <CategoryChip {...chipLook(category)} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-fg">
              {item.description} <span className="font-normal text-fg-muted">{etiquetaCuota(item.installment_no, item.installments)}</span>
            </span>
            {/* Sin `truncate`: con un guardado de 7+ cifras a 320px, envolver es mejor que cortar el monto. */}
            <span className="mt-0.5 block text-[11.5px] text-fg-muted">
              {category?.name ?? 'Sin categoría'}
              {item.savedCents > 0 && (
                <>
                  {' · '}
                  {/* Texto plano: `Money size="inline"` mide 15px fijos y acá desentona con el 11.5px. */}
                  <span className={cn('tabular-nums', covered && 'font-semibold text-accent-text')}>guardado {formatMoney(item.savedCents)}</span>
                </>
              )}
            </span>
          </span>
        </button>
        <Money cents={item.amountCents} tone={paid ? 'dim' : 'fg'} size="row" className="shrink-0" />
      </div>

      <AnimatePresence initial={false}>
        {open && !paid && (
          <m.div {...ROW_PRESENCE} className="overflow-hidden">
            <SaveEditor item={item} accountId={accountId} onAccountChange={onAccountChange} showAccountPicker={showAccountPicker} onDone={onToggle} />
          </m.div>
        )}
      </AnimatePresence>
    </li>
  )
}

/** Guardar plata para una cuota, en la misma fila: importe (precargado con lo que falta), si genera
 *  movimiento, y con qué cuenta — más los aportes ya cargados, para quitarlos. Mismas reglas que el
 *  modo Guardar de `fixed-expenses/MarkPaidDialog` (movimiento prendido por default, sólo con
 *  `movimientos-manuales`; cuenta sólo si genera movimiento). */
function SaveEditor({
  item,
  accountId,
  onAccountChange,
  showAccountPicker,
  onDone,
}: {
  item: SavedInstallment
  accountId: string
  onAccountChange: (id: string) => void
  showAccountPicker: boolean
  onDone: () => void
}) {
  const canMovimientosManuales = useCan('movimientos-manuales')
  // Precarga lo que falta guardar de esta cuota — «guardar el resto» es confirmar sin pensar. Ya
  // cubierta, arranca vacío (un «0» sólo se podría borrar).
  const [input, setInput] = useState(() => {
    const remaining = item.amountCents - item.savedCents
    return remaining > 0 ? centsToInputText(remaining) : ''
  })
  const [generateMovement, setGenerateMovement] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const addSaving = useAddCreditSaving()
  const removeSaving = useRemoveCreditSaving()
  const submittingRef = useRef(false)

  const cents = parseAmountToCents(input)
  const withMovement = canMovimientosManuales && generateMovement
  const accountMissing = withMovement && showAccountPicker && !accountId

  function save() {
    if (cents == null || cents <= 0 || cents >= MAX_AMOUNT_CENTS) {
      setError('Ingresá un importe válido')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    addSaving.mutate(
      { purchaseId: item.purchase_id, period: item.period, cents, generateMovement: withMovement, accountId: accountId || null },
      {
        onSuccess: onDone,
        onSettled: () => {
          submittingRef.current = false
        },
      },
    )
  }

  return (
    <div className="mx-panel mb-3 flex flex-col gap-4 rounded-control bg-surface-sunken p-4">
      <Field label="Guardar para esta cuota" error={error ?? undefined}>
        <AmountInput
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setError(null)
          }}
          invalid={!!error}
          aria-label={`Importe a guardar para ${item.description}`}
        />
      </Field>

      {canMovimientosManuales && (
        <label className="flex items-center gap-2.5 text-[13px] text-fg">
          <input
            type="checkbox"
            checked={generateMovement}
            onChange={(e) => setGenerateMovement(e.target.checked)}
            className="size-4 shrink-0 accent-accent"
          />
          Generar movimiento (descuenta del saldo ahora)
        </label>
      )}

      {withMovement && showAccountPicker && (
        <AccountField label="Con qué lo guardo" accountId={accountId} onChange={onAccountChange} deltaCents={cents == null ? null : -cents} />
      )}

      <Button onClick={save} disabled={addSaving.isPending || accountMissing} className="h-11 w-full">
        {addSaving.isPending ? 'Guardando…' : cents != null && cents > 0 ? `Guardar ${formatMoney(cents)}` : 'Guardar'}
      </Button>

      {item.savings.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-divider pt-3">
          {item.savings.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-[12.5px] text-fg-secondary">
              <Money cents={s.amountCents} tone="fg" size="inline" />
              <span className="min-w-0 flex-1 truncate text-fg-muted">
                {s.transaction_id ? 'con movimiento' : 'aparte'} · {format(new Date(s.saved_at), "d 'de' MMM", { locale: es })}
              </span>
              <button
                type="button"
                onClick={() => removeSaving.mutate(s.id)}
                disabled={removeSaving.isPending}
                aria-label={`Quitar guardado de ${formatMoney(s.amountCents)}`}
                className="grid size-8 place-items-center rounded-chip text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
              >
                <X className="size-3.5" strokeWidth={1.8} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
