import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { CopyButton } from '@/features/invites/CopyButton'
import { codeStatus, useAdminDeleteInviteCode, useAdminInviteCodes, useCreateInviteCode, type InviteCode } from '@/features/invites/api'
import { PLAN_LABEL, PLANS } from '@/features/access/plan'
import type { Plan } from '@/features/access/plan'

const dotTone: Record<string, string> = {
  'text-accent': 'bg-accent',
  'text-negative': 'bg-negative',
  'text-fg-muted': 'bg-border-strong',
}

/** La explicación de una línea, debajo del estado — nunca la misma frase que ya dice el label. */
function codeDetail(code: InviteCode, status: ReturnType<typeof codeStatus>) {
  const remaining = Math.max(code.maxUses - code.usedCount, 0)
  const expiry = code.expiresAt ? format(parseISO(code.expiresAt), 'd/MM', { locale: es }) : null

  if (status.label === 'Vencido') return `venció el ${expiry}`
  if (status.label === 'Agotado') return 'sin usos disponibles'
  if (status.label === 'Revocado') return 'ya no se puede usar'
  return expiry ? `quedan ${remaining} de ${code.maxUses} · vence el ${expiry}` : `quedan ${remaining} de ${code.maxUses}`
}

export function Invitaciones() {
  const { data: codes, isPending, isError, refetch } = useAdminInviteCodes()
  const createCode = useCreateInviteCode()
  const deleteCode = useAdminDeleteInviteCode()

  const [maxUses, setMaxUses] = useState('1')
  const [expiresAt, setExpiresAt] = useState('')
  const [plan, setPlan] = useState<Plan>('test')

  const activeCount = (codes ?? []).filter((c) => codeStatus(c).label === 'Activo').length

  async function handleCreate() {
    const uses = Number(maxUses)
    if (!Number.isInteger(uses) || uses < 1) return
    await createCode.mutateAsync({
      maxUses: uses,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      plan,
    })
    setMaxUses('1')
    setExpiresAt('')
    setPlan('test')
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Administración</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Invitaciones</h1>
        <p className="mt-2 max-w-md text-[13px] text-fg-muted">
          Todos los códigos del sistema, no sólo los que generaste vos — antes cada cuenta podía crear los suyos, ahora es sólo desde acá.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Panel>
          <PanelHeader
            title="Códigos"
            action={
              codes && codes.length > 0 ? (
                <span className="text-[11.5px] text-fg-muted">
                  {activeCount} activos de {codes.length}
                </span>
              ) : undefined
            }
          />

          <div className="px-6 pb-6">
            {isError ? (
              <ErrorState onRetry={() => refetch()} />
            ) : isPending ? (
              <div className="flex flex-col gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : !codes || codes.length === 0 ? (
              <EmptyState glyph="✉" title="Todavía no hay ningún código generado" />
            ) : (
              <ul>
                {codes.map((code) => {
                  const status = codeStatus(code)
                  return (
                    <li key={code.code} className="flex items-center gap-3.5 border-t border-fill-subtle py-3 first:border-t-0">
                      <span aria-hidden className={cn('size-[9px] shrink-0 rounded-full', dotTone[status.tone])} />
                      <span className="tnum shrink-0 font-mono text-[14px] tracking-wide text-fg">{code.code}</span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-[12.5px] font-semibold', status.tone)}>
                          {status.label} <span className="font-normal text-fg-muted">· {PLAN_LABEL[code.plan]}</span>
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-fg-muted">{codeDetail(code, status)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <CopyButton text={code.code} />
                        <button
                          type="button"
                          onClick={() => deleteCode.mutate(code.code)}
                          disabled={deleteCode.isPending}
                          className="rounded-chip px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Panel>

        <Panel className="p-6">
          <p className="eyebrow">Generar código nuevo</p>
          <div className="mt-4 flex flex-col gap-3.5">
            <div className="flex gap-3">
              <Field label="Usos" className="w-[88px] shrink-0">
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </Field>
              <Field label="Vence el" hint="Opcional" className="min-w-0 flex-1">
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            </div>
            <Field label="Plan" hint="Con qué acceso entra quien lo use">
              <Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="outline" onClick={handleCreate} disabled={createCode.isPending}>
              {createCode.isPending ? 'Generando…' : 'Generar'}
            </Button>
            <p className="text-[11.5px] leading-relaxed text-fg-muted">
              El código se muestra una vez generado, y se copia desde la lista. Un código sin vencimiento vale hasta que se agoten sus usos.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
