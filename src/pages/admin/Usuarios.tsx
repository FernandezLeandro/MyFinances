import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { PLAN_LABEL, PLANS } from '@/features/access/plan'
import type { Plan } from '@/features/access/plan'
import {
  useAdminDeleteUser,
  useAdminDeleteUsers,
  useAdminSetUserPlan,
  useAdminSetUserRole,
  useAdminUsers,
  type AdminUser,
} from '@/features/admin-users/api'

function lastSeenLabel(user: AdminUser) {
  if (!user.lastSignInAt) return 'nunca ingresó'
  return `último ingreso ${formatDistanceToNow(parseISO(user.lastSignInAt), { addSuffix: true, locale: es })}`
}

/** Cuerpo compartido por el diálogo de borrado individual y el masivo — mismo texto de advertencia,
 *  sólo cambia a quién/cuántos nombra. */
function DeleteWarning({ children }: { children: ReactNode }) {
  return (
    <p className="text-[14px] text-fg-secondary">
      {children} Se borra la cuenta y todo lo que cargó — movimientos, fijos, cuentas, todo. No se puede deshacer.
    </p>
  )
}

function UserRow({
  user,
  isSelf,
  selected,
  onToggleSelected,
}: {
  user: AdminUser
  isSelf: boolean
  selected: boolean
  onToggleSelected: () => void
}) {
  const setPlan = useAdminSetUserPlan()
  const setRole = useAdminSetUserRole()
  const deleteUser = useAdminDeleteUser()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <li className="flex flex-wrap items-center gap-3.5 border-t border-fill-subtle py-3 first:border-t-0">
      <input
        type="checkbox"
        checked={selected}
        disabled={isSelf}
        onChange={onToggleSelected}
        aria-label={`Seleccionar ${user.email ?? user.id}`}
        className="size-4 shrink-0 accent-accent"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-fg">
          {user.email ?? '(sin email)'}
          {isSelf && <span className="ml-1.5 text-[11px] font-normal text-fg-muted">(vos)</span>}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">
          {user.displayName ? `${user.displayName} · ` : ''}
          alta {format(parseISO(user.createdAt), 'd/MM/yy', { locale: es })} · {lastSeenLabel(user)} ·{' '}
          {user.transactionCount} movimiento{user.transactionCount === 1 ? '' : 's'}
        </p>
      </div>

      <Select
        className="w-[130px] shrink-0"
        value={user.plan}
        disabled={setPlan.isPending}
        onChange={(e) => setPlan.mutate({ userId: user.id, plan: e.target.value as Plan })}
      >
        {PLANS.map((p) => (
          <option key={p} value={p}>
            {PLAN_LABEL[p]}
          </option>
        ))}
      </Select>

      <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-secondary">
        <input
          type="checkbox"
          checked={user.role === 'admin'}
          disabled={setRole.isPending || (isSelf && user.role === 'admin')}
          onChange={(e) => setRole.mutate({ userId: user.id, role: e.target.checked ? 'admin' : 'user' })}
          className="size-4 accent-accent"
        />
        Admin
      </label>

      {!isSelf && (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleteUser.isPending}
          aria-label={`Eliminar ${user.email ?? user.id}`}
          className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
        >
          <Trash2 className="size-4" strokeWidth={1.3} aria-hidden />
        </button>
      )}

      {confirmingDelete && (
        <Dialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title="Eliminar cuenta"
          footer={
            <>
              <Button variant="ghost" size="dialogFooter" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="dialogFooter"
                onClick={() => deleteUser.mutate(user.id, { onSuccess: () => setConfirmingDelete(false) })}
                disabled={deleteUser.isPending}
              >
                {deleteUser.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </>
          }
        >
          <DeleteWarning>
            ¿Eliminar la cuenta de <span className="text-fg">{user.email ?? user.id}</span>?
          </DeleteWarning>
        </Dialog>
      )}
    </li>
  )
}

export function Usuarios() {
  const { user: me } = useAuth()
  const { data: users, isPending, isError, refetch } = useAdminUsers()
  const deleteUsers = useAdminDeleteUsers()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)

  const countByPlan = PLANS.reduce<Record<Plan, number>>(
    (acc, p) => ({ ...acc, [p]: (users ?? []).filter((u) => u.plan === p).length }),
    { test: 0, basic: 0, premium: 0 },
  )

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleBulkDelete() {
    deleteUsers.mutate([...selected], {
      onSuccess: () => {
        setSelected(new Set())
        setConfirmingBulkDelete(false)
      },
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Administración</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Usuarios</h1>
        <p className="mt-2 max-w-md text-[13px] text-fg-muted">
          Todas las cuentas del sistema. Cambiar el plan es inmediato — la próxima vez que esa cuenta cargue la app, ve lo que su plan nuevo
          habilita.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Panel>
          <PanelHeader
            title="Cuentas"
            action={
              selected.size > 0 ? (
                <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" strokeWidth={1.6} aria-hidden />} onClick={() => setConfirmingBulkDelete(true)}>
                  Eliminar {selected.size}
                </Button>
              ) : users && users.length > 0 ? (
                <span className="text-[11.5px] text-fg-muted">{users.length} en total</span>
              ) : undefined
            }
          />

          <div className="px-panel pb-6">
            {isError ? (
              <ErrorState onRetry={() => refetch()} />
            ) : isPending ? (
              <div className="flex flex-col gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : !users || users.length === 0 ? (
              <EmptyState glyph="◌" title="Todavía no hay ninguna cuenta registrada" />
            ) : (
              <ul>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === me?.id}
                    selected={selected.has(u.id)}
                    onToggleSelected={() => toggleSelected(u.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel className="p-panel">
          <p className="eyebrow">Por plan</p>
          <div className="mt-4 flex flex-col gap-2.5">
            {PLANS.map((p) => (
              <div key={p} className="flex items-center justify-between text-[13px]">
                <span className="text-fg-secondary">{PLAN_LABEL[p]}</span>
                <span className="tnum font-semibold text-fg">{countByPlan[p]}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {confirmingBulkDelete && (
        <Dialog
          open={confirmingBulkDelete}
          onClose={() => setConfirmingBulkDelete(false)}
          title="Eliminar cuentas"
          footer={
            <>
              <Button variant="ghost" size="dialogFooter" onClick={() => setConfirmingBulkDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" size="dialogFooter" onClick={handleBulkDelete} disabled={deleteUsers.isPending}>
                {deleteUsers.isPending ? 'Eliminando…' : `Eliminar ${selected.size}`}
              </Button>
            </>
          }
        >
          <DeleteWarning>
            ¿Eliminar <span className="text-fg">{selected.size}</span> cuenta{selected.size === 1 ? '' : 's'}?
          </DeleteWarning>
        </Dialog>
      )}
    </div>
  )
}
