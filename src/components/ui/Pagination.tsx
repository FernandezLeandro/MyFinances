import { useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { cn } from '@/lib/cn'
import { pageItems } from '@/lib/pagination'

interface PaginationProps {
  page: number
  pageCount: number
  pageSize: number
  pageSizeOptions: readonly number[]
  /** Total de filas sin paginar — para el "1–50 de 312". */
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const pageButton = 'grid h-8 min-w-8 place-items-center rounded-item px-1.5 text-[13px] font-semibold tnum transition-colors duration-150'
const arrowButton =
  'grid size-8 place-items-center rounded-item text-fg-secondary transition-colors duration-150 hover:bg-fill-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-35'

/**
 * Paginación del lado del cliente para Movimientos, en una sola línea (rediseño de Movimientos):
 * rango visible y tamaño de página (un `Menu`, no el `<select>` nativo) a la izquierda; las páginas a
 * la derecha — números con «…» desde `sm`, «4 de 15» en mobile. `total`/`pageCount` ya vienen
 * calculados por quien la usa (acá no conoce los datos, sólo la aritmética de mostrarlos).
 */
export function Pagination({ page, pageCount, pageSize, pageSizeOptions, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false)
  const sizeTriggerRef = useRef<HTMLButtonElement>(null)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  function pickSize(size: number) {
    setSizeMenuOpen(false)
    onPageSizeChange(size)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-divider px-panel py-3">
      <div className="flex items-center gap-1 text-[12.5px] whitespace-nowrap text-fg-muted">
        <span className="tnum">
          {from}–{to} de {total}
        </span>
        <span aria-hidden>·</span>
        <div className="relative">
          <button
            ref={sizeTriggerRef}
            type="button"
            onClick={() => setSizeMenuOpen((v) => !v)}
            aria-expanded={sizeMenuOpen}
            aria-label={`Movimientos por página: ${pageSize}`}
            className="flex h-8 items-center gap-1 rounded-item px-2 font-semibold text-fg-secondary transition-colors duration-150 hover:bg-fill-subtle hover:text-fg"
          >
            <span>
              <span className="tnum">{pageSize}</span> por página
            </span>
            <ChevronDown className={cn('size-3.5 transition-transform duration-150', sizeMenuOpen && 'rotate-180')} aria-hidden />
          </button>
          <Menu
            open={sizeMenuOpen}
            onClose={() => setSizeMenuOpen(false)}
            triggerRef={sizeTriggerRef}
            anchorClassName="top-full left-0 mt-1 w-[150px]"
          >
            {pageSizeOptions.map((size) => (
              <MenuItem
                key={size}
                onClick={() => pickSize(size)}
                icon={<Check className={cn('size-3.5 shrink-0', size !== pageSize && 'invisible')} strokeWidth={2.6} aria-hidden />}
              >
                <span>
                  <span className="tnum">{size}</span> por página
                </span>
              </MenuItem>
            ))}
          </Menu>
        </div>
      </div>

      <nav aria-label="Páginas" className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className={arrowButton}
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
        </button>
        <span className="px-1 text-[12.5px] whitespace-nowrap text-fg-muted tnum sm:hidden">
          {page} de {pageCount}
        </span>
        <div className="hidden items-center gap-1 sm:flex">
          {pageItems(page, pageCount).map((item, i) =>
            item === 'gap' ? (
              <span key={`gap-${i}`} aria-hidden className="w-5 text-center text-[13px] text-fg-muted">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Página ${item}`}
                className={cn(
                  pageButton,
                  item === page ? 'bg-inverse text-on-inverse' : 'text-fg-secondary hover:bg-fill-subtle hover:text-fg',
                )}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Página siguiente"
          className={arrowButton}
        >
          <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </nav>
    </div>
  )
}
