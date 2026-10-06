import { HelpActionList } from '@/components/help/HelpActionList'
import { HelpAnnotated } from '@/components/help/HelpAnnotated'
import { HelpFaq } from '@/components/help/HelpFaq'
import { HelpLegend } from '@/components/help/HelpLegend'
import { HelpPage, HelpSection } from '@/components/help/HelpPage'
import { FixedHelpDiagram } from '@/features/fixed-expenses/FixedHelpDiagram'
import { useCan } from '@/features/access/useCan'
import { FIXED_HELP, FIXED_HELP_BASIC } from '@/features/fixed-expenses/help-content'

/**
 * Ayuda de Fijos (`/fijos/ayuda`, mismo plan que Fijos). Contenido estático: sin datos de quien la
 * mira, los importes de la maqueta son de ejemplo. El texto vive en `help-content.tsx`.
 */
export function FijosAyuda() {
  // Básico guarda plata aparte y no la descuenta al pagar: su texto lo dice (ver `FIXED_HELP_BASIC`).
  const help = useCan('movimientos-manuales') ? FIXED_HELP : FIXED_HELP_BASIC
  return (
    <HelpPage parentTo="/fijos" parentLabel="Fijos" title={help.title} intro={help.intro}>
      <HelpSection id="la-pantalla" title="La pantalla, por partes" narrow>
        <HelpAnnotated diagram={<FixedHelpDiagram />} legend={<HelpLegend items={help.legend} />} />
      </HelpSection>

      <HelpSection id="acciones" title="Cada acción, y qué le hace a tu saldo" subtitle={help.actionsSubtitle} narrow>
        <HelpActionList actions={help.actions} />
      </HelpSection>

      <HelpSection id="preguntas" title="Preguntas que aparecen seguido">
        <HelpFaq items={help.faq} />
      </HelpSection>
    </HelpPage>
  )
}
