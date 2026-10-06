import { HelpActionList } from '@/components/help/HelpActionList'
import { HelpAnnotated } from '@/components/help/HelpAnnotated'
import { HelpFaq } from '@/components/help/HelpFaq'
import { HelpLegend } from '@/components/help/HelpLegend'
import { HelpPage, HelpSection } from '@/components/help/HelpPage'
import { MovementsHelpDiagram } from '@/features/transactions/MovementsHelpDiagram'
import { MOVEMENTS_HELP } from '@/features/transactions/help-content'

/**
 * Ayuda de Movimientos (`/movimientos/ayuda`, mismo plan que Movimientos). Contenido estático: sin datos
 * de quien la mira, los importes de la maqueta son de ejemplo. El texto vive en `help-content.tsx`.
 */
export function MovimientosAyuda() {
  return (
    <HelpPage parentTo="/movimientos" parentLabel="Movimientos" title={MOVEMENTS_HELP.title} intro={MOVEMENTS_HELP.intro}>
      <HelpSection id="la-pantalla" title="La pantalla, por partes" narrow>
        <HelpAnnotated diagram={<MovementsHelpDiagram />} legend={<HelpLegend items={MOVEMENTS_HELP.legend} />} />
      </HelpSection>

      <HelpSection id="que-suma" title="Qué suma y qué no" subtitle={MOVEMENTS_HELP.kindsSubtitle} narrow>
        <HelpActionList actions={MOVEMENTS_HELP.kinds} />
      </HelpSection>

      <HelpSection id="preguntas" title="Preguntas que aparecen seguido">
        <HelpFaq items={MOVEMENTS_HELP.faq} />
      </HelpSection>
    </HelpPage>
  )
}
