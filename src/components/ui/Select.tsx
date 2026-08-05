import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { controlBase } from '@/components/ui/Input'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }

/** `<select>` nativo estilizado. En mobile abre el picker del sistema, que siempre gana. */
export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          'h-11 appearance-none pr-10 text-[15px]',
          invalid && 'ring-1 ring-coral/60',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-3.5 size-3 -translate-y-1/2 text-chalk-faint"
      >
        <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}
