import { useRef } from 'react'
import { Menu, MenuDivider, MenuItem } from '@/components/ui/Menu'
import { ActionSheet, ActionSheetCancel, ActionSheetItem } from '@/components/ui/ActionSheet'
import { Money } from '@/components/ui/Money'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/cn'
import { accountMenuEntries, type AccountMenuActionId } from '@/features/accounts/aggregate'

interface AccountActionsMenuProps {
  accountName: string
  balanceCents: number
  /** El color de la cuenta en la composición del total — el punto del encabezado de la hoja. */
  color: string
  isDefault: boolean
  activeCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: (id: AccountMenuActionId) => void
  /** La tarjeta oscura (predeterminada) pide un botón `⋯` claro sobre fondo oscuro. */
  onInverse?: boolean
}

/**
 * El `⋯` de una tarjeta de cuenta: un popover pegado al botón en pantallas anchas y una hoja
 * inferior en el celular. Los ítems salen de `accountMenuEntries`, una sola fuente para los dos.
 *
 * Popover u hoja se decide con `useMediaQuery` y no con CSS: la hoja es un `<dialog>` modal, y uno
 * abierto pero oculto con `display: none` dejaría la página inerte y sin nada a la vista.
 */
export function AccountActionsMenu({
  accountName,
  balanceCents,
  color,
  isDefault,
  activeCount,
  open,
  onOpenChange,
  onAction,
  onInverse = false,
}: AccountActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isWide = useMediaQuery('(min-width: 640px)')
  const label = accountName || 'la cuenta'

  function run(id: AccountMenuActionId) {
    onOpenChange(false)
    onAction(id)
  }

  const entries = accountMenuEntries({ surface: isWide ? 'popover' : 'sheet', isDefault, activeCount })
  const close = () => onOpenChange(false)

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={`Más opciones de ${label}`}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          'grid size-11 place-items-center rounded-item border text-[15px] leading-none transition-colors duration-150 sm:size-8 sm:border-transparent',
          onInverse
            ? 'border-inverse-divider text-on-inverse-secondary hover:bg-inverse-divider'
            : 'border-border-strong text-fg-muted hover:bg-fill-subtle',
          open && (onInverse ? 'bg-inverse-divider' : 'bg-fill-subtle text-fg'),
        )}
      >
        <span aria-hidden>⋯</span>
      </button>

      {isWide ? (
        <Menu open={open} onClose={close} triggerRef={triggerRef} anchorClassName="top-full right-0 mt-1 w-[216px]">
          {entries.map((entry, i) =>
            entry.kind === 'divider' ? (
              <MenuDivider key={`divider-${i}`} />
            ) : (
              <MenuItem key={entry.id} tone={entry.tone} onClick={() => run(entry.id)}>
                {entry.label}
              </MenuItem>
            ),
          )}
        </Menu>
      ) : (
        <ActionSheet
          open={open}
          onClose={close}
          label={`Acciones de ${label}`}
          header={
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{accountName || '(sin nombre)'}</p>
              <Money cents={balanceCents} size="row" tone="dim" />
            </div>
          }
        >
          {entries.map((entry) =>
            entry.kind === 'divider' ? null : (
              <ActionSheetItem
                key={entry.id}
                tone={entry.tone}
                emphasis={entry.id === 'adjust'}
                onClick={() => run(entry.id)}
              >
                {entry.label}
              </ActionSheetItem>
            ),
          )}
          <ActionSheetCancel onClick={close} />
        </ActionSheet>
      )}
    </div>
  )
}
