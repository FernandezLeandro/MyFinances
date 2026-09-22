import { HelpActionList } from '@/components/help/HelpActionList'
import { HelpAnnotated } from '@/components/help/HelpAnnotated'
import { HelpFaq } from '@/components/help/HelpFaq'
import { HelpLegend } from '@/components/help/HelpLegend'
import { HelpPage, HelpSection } from '@/components/help/HelpPage'
import { HelpSteps } from '@/components/help/HelpSteps'
import { AccountsHelpDiagram } from '@/features/accounts/AccountsHelpDiagram'
import { ACCOUNTS_HELP } from '@/features/accounts/help-content'

/**
 * Ayuda de Cuentas (`/cuentas/ayuda`, mismo plan que Cuentas). Es contenido estático: sin datos de
 * la cuenta de quien la mira, sin estado — los importes de la maqueta son de ejemplo. El texto vive en
 * `help-content.tsx`; si cambia el menú de una cuenta, hay que tocar también ahí.
 */
export function CuentasAyuda() {
  return (
    <HelpPage parentTo="/cuentas" parentLabel="Cuentas" title={ACCOUNTS_HELP.title} intro={ACCOUNTS_HELP.intro}>
      <HelpSection id="lo-basico" title="Lo básico, en tres pasos">
        <HelpSteps steps={ACCOUNTS_HELP.steps} />
      </HelpSection>

      <HelpSection id="la-pantalla" title="La pantalla, por partes" narrow>
        <HelpAnnotated diagram={<AccountsHelpDiagram />} legend={<HelpLegend items={ACCOUNTS_HELP.legend} />} />
      </HelpSection>

      <HelpSection id="acciones" title="Cada acción, y qué le hace a tu saldo" subtitle={ACCOUNTS_HELP.actionsSubtitle} narrow>
        <HelpActionList actions={ACCOUNTS_HELP.actions} footnote={ACCOUNTS_HELP.actionsFootnote} />
      </HelpSection>

      <HelpSection id="preguntas" title="Preguntas que aparecen seguido">
        <HelpFaq items={ACCOUNTS_HELP.faq} />
      </HelpSection>
    </HelpPage>
  )
}
