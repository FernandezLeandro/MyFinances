import type { ReactNode } from 'react'
import { HELP_READING_WIDTH } from '@/components/help/reading-width'
import { PageBreadcrumb } from '@/components/ui/PageBreadcrumb'
import { cn } from '@/lib/cn'

interface HelpPageProps {
  /** La pantalla a la que la ayuda pertenece: la miga apunta ahí. */
  parentTo: string
  parentLabel: string
  title: string
  intro: string
  children: ReactNode
}

/**
 * El marco de la ayuda de una pantalla (`/<pantalla>/ayuda`): miga al padre, eyebrow "Ayuda", título y
 * bajada, y debajo las secciones. Es una ruta propia y no un modal para poder mandarla por link,
 * buscarla con Ctrl+F y volver con el back del navegador.
 *
 * No pone padding, fondo ni ancho máximo: el gutter, el tope, el colchón de la isla del celular y el
 * ancho de la pantalla ya los pone el shell (`MAIN_SHELL_CLASS` + el contenedor de `AppLayout`),
 * igual que en todas las demás pantallas. Si acá se agregara un `max-w`, la ayuda quedaría más
 * angosta que la pantalla de la que cuelga.
 */
export function HelpPage({ parentTo, parentLabel, title, intro, children }: HelpPageProps) {
  return (
    <div className="flex flex-col gap-[14px]">
      <PageBreadcrumb to={parentTo} label={parentLabel} />

      <header className="flex flex-col gap-3">
        <p className="eyebrow">Ayuda</p>
        <h1 className="font-display text-figure font-semibold">{title}</h1>
        <p className="max-w-[620px] text-sm leading-[1.6] text-fg-secondary text-pretty">{intro}</p>
      </header>

      {children}
    </div>
  )
}

interface HelpSectionProps {
  /** Ancla de la sección (`#id`): sirve para linkear directo a una parte de la ayuda. */
  id: string
  title: string
  subtitle?: string
  /** La achica a `HELP_READING_WIDTH` y la centra — para lo que se lee de corrido o es una
   *  ilustración. Sin esto ocupa el ancho de la pantalla, como el resto de la app. */
  narrow?: boolean
  children: ReactNode
}

/** Una sección de la ayuda: su `<h2>` y, debajo, lo que la explica. */
export function HelpSection({ id, title, subtitle, narrow = false, children }: HelpSectionProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn('mt-2 flex flex-col gap-[14px]', narrow && `mx-auto w-full ${HELP_READING_WIDTH}`)}
    >
      <div>
        <h2 id={id} className="font-display text-[19px] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-[13px] text-fg-muted text-pretty">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}
