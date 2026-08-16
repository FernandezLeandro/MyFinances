import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useDeleteSpendingBudget, useSpendingBudget, useUpsertSpendingBudget } from '@/features/budgets/api'
import { projectBudget } from '@/features/budgets/aggregate'

const schema = z.object({
  name: z.string().min(1, 'Falta el nombre').max(80),
  amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! >= 0, {
    message: 'Ingresá un importe válido',
  }),
})

type FormValues = z.infer<typeof schema>

interface BudgetFormDialogProps {
  open: boolean
  onClose: () => void
}

/** Un solo presupuesto por cuenta (hoy sólo "Comida"): a diferencia de un gasto fijo, no tiene
 *  vencimiento ni se marca pagado — el monto mensual se reparte solo, al ritmo diario, en el cuarto
 *  término de rpc_projected_balance. Ver SaldoProyectadoPanel para el desglose. */
export function BudgetFormDialog({ open, onClose }: BudgetFormDialogProps) {
  const { data: budget } = useSpendingBudget()
  const upsertBudget = useUpsertSpendingBudget()
  const deleteBudget = useDeleteSpendingBudget()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: 'Comida', amount: '' },
  })

  // Mismo cálculo que el panel (`projectBudget`), pero en vivo sobre lo que se está tipeando —
  // así el desglose "por día" queda pegado al campo que lo genera en vez de vivir siempre visible
  // en el panel principal.
  const previewCents = parseAmountToCents(watch('amount')) ?? 0
  const dailyCents = projectBudget(previewCents, new Date(), new Date()).dailyCents

  useEffect(() => {
    if (!open) return
    reset(budget ? { name: budget.name, amount: centsToInputText(budget.cents) } : { name: 'Comida', amount: '' })
  }, [open, budget, reset])

  async function onSubmit(values: FormValues) {
    await upsertBudget.mutateAsync({ name: values.name.trim(), cents: parseAmountToCents(values.amount)! })
    onClose()
  }

  // Mismo gotcha que FixedExpenseDetailDialog/CuadrarSaldoDialog: el <dialog> nativo dispara
  // "close" tanto al cerrarlo el usuario como al abrir la confirmación encima (que baja `open` acá
  // a false). Sin este filtro, confirmar el borrado cerraba los dos diálogos de un tirón.
  function handleDialogClose() {
    if (!confirmingDelete) onClose()
  }

  async function handleConfirmDelete() {
    if (!budget) return
    await deleteBudget.mutateAsync(budget.id)
    setConfirmingDelete(false)
    onClose()
  }

  return (
    <>
      <Dialog
        open={open && !confirmingDelete}
        onClose={handleDialogClose}
        title="Gasto variable estimado"
        footer={
          <>
            {budget && (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)} className="mr-auto">
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-1.5">
            <Field label="Importe mensual" error={errors.amount?.message}>
              <AmountInput invalid={!!errors.amount} {...register('amount')} />
            </Field>
            {previewCents > 0 && (
              <p className="text-[12px] text-chalk-faint">
                <Money cents={dailyCents} tone="dim" /> por día · <Money cents={previewCents} tone="dim" /> al mes
              </p>
            )}
          </div>

          <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
            <Input id="name" placeholder="Comida" invalid={!!errors.name} {...register('name')} />
          </Field>

          <p className="text-[12px] text-chalk-faint">
            El saldo proyectado descuenta este monto al ritmo diario, según los días que falten del mes —
            no mira lo que ya gastaste, así que si venís gastando de más el proyectado lo va a reflejar.
          </p>
        </form>
      </Dialog>

      {confirmingDelete && (
        <Dialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title="Eliminar gasto variable"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete} disabled={deleteBudget.isPending}>
                {deleteBudget.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </>
          }
        >
          <p className="text-[14px] text-chalk-dim">
            ¿Eliminar <span className="text-chalk">{budget?.name}</span>? Deja de descontarse del saldo proyectado
            hasta que cargues un nuevo monto.
          </p>
        </Dialog>
      )}
    </>
  )
}
