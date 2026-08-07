import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { CopyButton } from '@/features/invites/CopyButton'
import { codeStatus, useAdminDeleteInviteCode, useAdminInviteCodes, useCreateInviteCode } from '@/features/invites/api'

export function Invitaciones() {
  const { data: codes, isPending, isError, refetch } = useAdminInviteCodes()
  const createCode = useCreateInviteCode()
  const deleteCode = useAdminDeleteInviteCode()

  const [maxUses, setMaxUses] = useState('1')
  const [expiresAt, setExpiresAt] = useState('')

  async function handleCreate() {
    const uses = Number(maxUses)
    if (!Number.isInteger(uses) || uses < 1) return
    await createCode.mutateAsync({
      maxUses: uses,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    setMaxUses('1')
    setExpiresAt('')
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Administración</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Invitaciones</h1>
        <p className="mt-2 max-w-md text-[13px] text-chalk-faint">
          Todos los códigos del sistema, no sólo los que generaste vos — antes cada cuenta podía crear los suyos, ahora es sólo desde acá.
        </p>
      </header>

      <Panel>
        <PanelHeader title="Códigos" />

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
                const remaining = Math.max(code.maxUses - code.usedCount, 0)
                return (
                  <li
                    key={code.code}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-850 py-2.5 text-[13px] first:border-t-0"
                  >
                    <span className="tnum font-mono text-chalk">{code.code}</span>
                    <span className={cn('text-[11px] font-medium', status.tone)}>{status.label}</span>
                    <span className="text-[12px] text-chalk-faint">
                      quedan {remaining} de {code.maxUses}
                    </span>
                    {code.expiresAt && (
                      <span className="text-[12px] text-chalk-faint">{format(parseISO(code.expiresAt), 'd/MM', { locale: es })}</span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <CopyButton text={code.code} />
                      <button
                        type="button"
                        onClick={() => deleteCode.mutate(code.code)}
                        disabled={deleteCode.isPending}
                        className="rounded-chip px-2 py-1 text-[11px] text-chalk-faint transition-colors hover:bg-ink-800 hover:text-coral"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-5 border-t border-ink-800 pt-4">
            <p className="eyebrow">Generar código nuevo</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Usos" className="w-20">
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </Field>
              <Field label="Vence el" hint="Opcional" className="min-w-[140px] flex-1">
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
              <Button variant="outline" onClick={handleCreate} disabled={createCode.isPending}>
                {createCode.isPending ? 'Generando…' : 'Generar'}
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
