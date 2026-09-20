import { useMemo } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { useCategories } from '@/features/categories/api'
import { useMarkCreditCardPaid, type CreditCard, type CreditInstallment } from '@/features/credits/api'
import { etiquetaCuota } from '@/features/credits/format'
import type { CardSummary } from '@/features/credits/aggregate'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'

interface MarkCardPaidDialogProps {
  open: boolean
  onClose: () => void
  card: CreditCard
  period: string
  summary: CardSummary | null
}

interface CategoryGroup {
  categoryId: string | null
  name: string
  color?: string
  items: CreditInstallment[]
  totalCents: number
}

/** Marca el período como pagado: sin importe ni categoría para elegir acá — cada compra ya trae la
 *  suya (ver `PurchaseFormDialog`), así que el servidor arma UN MOVIMIENTO POR CATEGORÍA presente
 *  este mes, agrupando las cuotas que la comparten. Esto sólo muestra esa agrupación de antemano,
 *  para que quede claro qué se va a generar antes de confirmar. */
export function MarkCardPaidDialog({ open, onClose, card, period, summary }: MarkCardPaidDialogProps) {
  const { data: categories } = useCategories()
  const markPaid = useMarkCreditCardPaid()
  const [accountId, setAccountId] = useDefaultAccountId()
  const picker = useAccountPicker()

  const groups = useMemo<CategoryGroup[]>(() => {
    const items = summary?.items ?? []
    const byCategory = new Map<string | null, CreditInstallment[]>()
    for (const item of items) {
      const key = item.category_id
      byCategory.set(key, [...(byCategory.get(key) ?? []), item])
    }
    return [...byCategory.entries()]
      .map(([categoryId, groupItems]) => {
        const category = categories?.find((c) => c.id === categoryId)
        return {
          categoryId,
          name: category?.name ?? 'Sin categoría',
          color: category?.color,
          items: groupItems,
          totalCents: groupItems.reduce((sum, i) => sum + i.amountCents, 0),
        }
      })
      .sort((a, b) => b.totalCents - a.totalCents)
  }, [summary, categories])

  const totalCents = summary?.totalCents ?? 0

  async function handleConfirm() {
    await markPaid.mutateAsync({ cardId: card.id, period, accountId: accountId || null })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Marcar tarjeta como pagada"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleConfirm} disabled={markPaid.isPending || (picker.show && !accountId)}>
            {markPaid.isPending ? 'Guardando…' : 'Marcar pagada'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">{card.name}</p>
          <Money cents={totalCents} tone="dim" size="figure" className="mt-1" />
        </div>

        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.categoryId ?? 'sin-categoria'} className="rounded-control bg-surface-sunken px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-fg">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.color ?? 'var(--color-border-strong)' }} />
                  {group.name}
                </span>
                <Money cents={group.totalCents} tone="dim" size="inline" />
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {group.items.map((item) => (
                  <li key={item.purchase_id} className="flex items-center justify-between gap-3 text-[12px] text-fg-muted">
                    <span className="min-w-0 truncate">
                      {item.description} {etiquetaCuota(item.installment_no, item.installments)}
                    </span>
                    <Money cents={item.amountCents} tone="dim" size="inline" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-[12px] text-fg-muted">
          {groups.length > 1
            ? `Se van a generar ${groups.length} movimientos, uno por categoría.`
            : 'Se va a generar un movimiento con el detalle de lo abonado en la descripción.'}
        </p>

        {picker.show && (
          <Field label="Con qué lo pagué" hint="Se usa en todos los movimientos que genere">
            <AccountSelect required value={accountId} onChange={setAccountId} />
          </Field>
        )}
      </div>
    </Dialog>
  )
}
