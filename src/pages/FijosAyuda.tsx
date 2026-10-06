import { HelpActionList } from '@/components/help/HelpActionList'
import { HelpAnnotated } from '@/components/help/HelpAnnotated'
import { HelpFaq } from '@/components/help/HelpFaq'
import { HelpLegend } from '@/components/help/HelpLegend'
import { HelpPage, HelpSection } from '@/components/help/HelpPage'
import { FixedHelpDiagram } from '@/features/fixed-expenses/FixedHelpDiagram'
import { FIXED_HELP } from '@/features/fixed-expenses/help-content'

/**
 * Ayuda de Fijos (`/fijos/ayuda`, mismo plan que Fijos). Contenido estático: sin datos de quien la
 * mira, los importes de la maqueta son de ejemplo. El texto vive en `help-content.tsx`.
 */
export function FijosAyuda() {
  return (
    <HelpPage parentTo="/fijos" parentLabel="Fijos" title={FIXED_HELP.title} intro={FIXED_HELP.intro}>
      <HelpSection id="la-pantalla" title="La pantalla, por partes" narrow>
        <HelpAnnotated diagram={<FixedHelpDiagram />} legend={<HelpLegend items={FIXED_HELP.legend} />} />
      </HelpSection>

      <HelpSection id="acciones" title="Cada acción, y qué le hace a tu saldo" subtitle={FIXED_HELP.actionsSubtitle} narrow>
        <HelpActionList actions={FIXED_HELP.actions} />
      </HelpSection>

      <HelpSection id="preguntas" title="Preguntas que aparecen seguido">
        <HelpFaq items={FIXED_HELP.faq} />
      </HelpSection>
    </HelpPage>
  )
}
