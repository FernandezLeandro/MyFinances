import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'

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

/**
 * Paginación del lado del cliente para Movimientos: rango visible + selector de tamaño + anterior/
 * siguiente. `total`/`pageCount` ya vienen calculados por quien la usa (acá no conoce los datos, sólo
 * la aritmética de mostrarlos) — mismo criterio "presentacional puro" que `MonthNav`.
 */
export function Pagination({ page, pageCount, pageSize, pageSizeOptions, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col gap-2.5 border-t border-divider px-panel py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-[12px] text-fg-muted">
        <span className="tnum whitespace-nowrap">
          {from}–{to} de {total}
        </span>
        <label className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="hidden sm:inline">por página</span>
          <Select
            aria-label="Movimientos por página"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 w-[76px] pr-8 text-[12px]"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-[12px] whitespace-nowrap text-fg-muted">
          Página {page} de {pageCount}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
            icon={<ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Página siguiente"
            icon={<ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden />}
          />
        </div>
      </div>
    </div>
  )
}
