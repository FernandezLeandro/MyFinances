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
import {
  useCreateInviteCode,
  useDeactivateInviteCode,
  useMyInviteCodes,
  type InviteCode,
} from '@/features/invites/api'

function codeStatus(code: InviteCode) {
  if (!code.isActive) return { label: 'Revocado', tone: 'text-chalk-faint' }
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) return { label: 'Vencido', tone: 'text-coral' }
  if (code.usedCount >= code.maxUses) return { label: 'Agotado', tone: 'text-coral' }
  return { label: 'Activo', tone: 'text-acid' }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-chip px-2 py-1 text-[11px] text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
    >
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

export function Invitaciones() {
  const { data: codes, isPending, isError, refetch } = useMyInviteCodes()
  const createCode = useCreateInviteCode()
  const deactivateCode = useDeactivateInviteCode()

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
        <p className="eyebrow">Invitaciones</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Invitaciones</h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Códigos generados" />
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isPending ? (
            <ul className="flex flex-col gap-1 px-6 py-5">
              {[0, 1].map((i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 flex-1" />
                </li>
              ))}
            </ul>
          ) : !codes || codes.length === 0 ? (
            <EmptyState glyph="✉" title="Todavía no generaste ningún código" />
          ) : (
            <ul className="pb-3">
              {codes.map((code) => {
                const status = codeStatus(code)
                return (
                  <li
                    key={code.code}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850"
                  >
                    <span className="tnum font-mono text-[13px] text-chalk">{code.code}</span>
                    <span className={cn('text-[11px] font-medium', status.tone)}>{status.label}</span>
                    <span className="text-[12px] text-chalk-faint">
                      {code.usedCount}/{code.maxUses} usos
                    </span>
                    {code.expiresAt && (
                      <span className="text-[12px] text-chalk-faint">
                        vence {format(parseISO(code.expiresAt), "d 'de' MMMM", { locale: es })}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <CopyButton text={code.code} />
                      {status.label === 'Activo' && (
                        <button
                          type="button"
                          onClick={() => deactivateCode.mutate(code.code)}
                          className="rounded-chip px-2 py-1 text-[11px] text-chalk-faint transition-colors hover:bg-ink-800 hover:text-coral"
                        >
                          Revocar
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel className="p-6">
          <p className="eyebrow">Generar código nuevo</p>
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Usos permitidos">
              <Input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </Field>
            <Field label="Vence el" hint="Opcional">
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
            <Button onClick={handleCreate} disabled={createCode.isPending}>
              {createCode.isPending ? 'Generando…' : 'Generar código'}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
