import { HelpActionList } from '@/components/help/HelpActionList'
import { HelpAnnotated } from '@/components/help/HelpAnnotated'
import { HelpFaq } from '@/components/help/HelpFaq'
import { HelpLegend } from '@/components/help/HelpLegend'
import { HelpPage, HelpSection } from '@/components/help/HelpPage'
import { MovementsHelpDiagram } from '@/features/transactions/MovementsHelpDiagram'
import { useCan } from '@/features/access/useCan'
import { MOVEMENTS_HELP, MOVEMENTS_HELP_BASIC } from '@/features/transactions/help-content'

/**
 * Ayuda de Movimientos (`/movimientos/ayuda`, mismo plan que Movimientos). Contenido estático: sin datos
 * de quien la mira, los importes de la maqueta son de ejemplo. El texto vive en `help-content.tsx`.
 */
export function MovimientosAyuda() {
  // Básico (sin carga manual) tiene su propio texto: sus movimientos salen de pagar fijos y de «Sueldo».
  const help = useCan('movimientos-manuales') ? MOVEMENTS_HELP : MOVEMENTS_HELP_BASIC
  return (
    <HelpPage parentTo="/movimientos" parentLabel="Movimientos" title={help.title} intro={help.intro}>
      <HelpSection id="la-pantalla" title="La pantalla, por partes" narrow>
        <HelpAnnotated diagram={<MovementsHelpDiagram />} legend={<HelpLegend items={help.legend} />} />
      </HelpSection>

      <HelpSection id="que-suma" title="Qué suma y qué no" subtitle={help.kindsSubtitle} narrow>
        <HelpActionList actions={help.kinds} />
      </HelpSection>

      <HelpSection id="preguntas" title="Preguntas que aparecen seguido">
        <HelpFaq items={help.faq} />
      </HelpSection>
    </HelpPage>
  )
}
