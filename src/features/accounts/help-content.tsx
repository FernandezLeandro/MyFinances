import type { HelpAction, HelpFaqItem, HelpLegendItem, HelpStep } from '@/components/help/types'
import type { AccountMenuActionId } from '@/features/accounts/aggregate'

/** Una acción de la ayuda atada a una acción real. `create` y `transfer` salen de la tarjeta del total
 *  (no del menú `⋯`); las demás son ids del menú de `accountMenuEntries()`. */
export type AccountHelpAction = HelpAction & { id: 'create' | AccountMenuActionId }

const strong = (text: string) => <strong className="font-semibold text-fg">{text}</strong>

/**
 * El texto de la ayuda de Cuentas. Vive acá y no en el markup para que la pantalla sea sólo layout,
 * y porque es lo que más se desactualiza: la fuente de verdad de las acciones es
 * `accountMenuEntries()` (aggregate.ts) + `useAccountActions`, y `help-content.test.ts` avisa si el
 * menú suma o cambia una acción sin que se toque esta lista. Copy en voseo rioplatense, del handoff.
 */
export const ACCOUNTS_HELP = {
  title: 'Cómo usar Cuentas',
  intro:
    'Cuentas es donde declarás dónde está tu plata: efectivo, billeteras virtuales y bancos. Tu saldo en la app es la suma de esas cuentas.',

  steps: [
    {
      title: 'Cargá tus cuentas',
      body: 'Una por cada lugar donde tenés plata. Al crearla te preguntamos cuánto tenés hoy ahí.',
    },
    {
      title: 'Elegí la predeterminada',
      body: 'Es la que viene elegida cuando cargás un movimiento nuevo. Es la tarjeta oscura.',
    },
    {
      title: 'Reajustá si no coincide',
      body: (
        <>
          Si el banco dice otra cosa que la app, abrí {strong('Reajustar saldo')} y decí cuánto tenés de verdad.
        </>
      ),
    },
  ] satisfies HelpStep[],

  legend: [
    { lead: 'El total.', body: 'La suma de tus cuentas activas.' },
    { lead: 'De qué está hecho.', body: 'La barra reparte el total por cuenta.' },
    { lead: 'Una tarjeta por cuenta.', body: 'Su nombre y su saldo de hoy. La oscura es la predeterminada.' },
    { lead: 'Reajustar saldo.', body: 'La acción principal: la usás cuando el número no coincide.' },
    { lead: 'El menú ⋯.', body: 'El resto de las acciones de esa cuenta.' },
    { lead: 'Archivadas y Últimas transferencias.', body: 'Se despliegan al tocarlas.' },
  ] satisfies HelpLegendItem[],

  actionsSubtitle: 'Las dos primeras están al pie del total; el resto salen del menú ⋯ de una cuenta.',

  actions: [
    {
      id: 'create',
      name: 'Nueva cuenta',
      effect: { label: 'Depende de lo que elijas', tone: 'neutral' },
      description:
        'Elegís el tipo, le ponés un nombre y declarás cuánto tenés hoy ahí. Si es tu primera cuenta y declarás menos que tu saldo, lo que sobra queda guardado en «Sin repartir» y el total no se mueve. Si ya tenés cuentas, decidís si esa plata sale de otra cuenta (el total no cambia) o es plata que la app no conocía (el total sube). La frase debajo del importe te dice, en vivo, en cuánto queda tu saldo.',
    },
    {
      id: 'transfer',
      name: 'Transferir entre cuentas',
      effect: { label: 'El total no cambia', tone: 'accent' },
      // El botón del total dice «Transferir entre cuentas» y el menú de cada cuenta «Transferir desde
      // acá»: son dos entradas al mismo diálogo, y la ayuda tiene que nombrar las dos.
      description:
        'Mover plata de una cuenta tuya a otra. No es gasto ni ingreso, así que no aparece en Movimientos. En el menú ⋯ de cada cuenta la encontrás como «Transferir desde acá».',
    },
    {
      id: 'adjust',
      name: 'Reajustar saldo',
      effect: { label: 'El total pasa a lo que declaraste', tone: 'accent' },
      description:
        'Decís cuánto tenés de verdad en esa cuenta. La diferencia queda en Movimientos como «Ajuste de saldo», o podés corregir el saldo con el que arrancó la cuenta.',
    },
    {
      id: 'edit',
      name: 'Editar cuenta',
      effect: { label: 'El total no cambia', tone: 'accent' },
      description: 'Cambiar el nombre o el tipo. El saldo se toca desde Reajustar saldo.',
    },
    {
      id: 'setDefault',
      name: 'Hacer predeterminada',
      effect: { label: 'El total no cambia', tone: 'accent' },
      description: 'La cuenta que viene elegida cada vez que cargás algo nuevo.',
    },
    {
      id: 'viewMovements',
      name: 'Ver movimientos',
      effect: { label: 'El total no cambia', tone: 'accent' },
      description: 'Abre Movimientos filtrado por esa cuenta, con todo su historial.',
    },
    {
      id: 'archive',
      name: 'Archivar',
      effect: { label: 'El total baja por su saldo', tone: 'amber' },
      description:
        'Para una cuenta que dejaste de usar. Deja de sumar al total, pero queda guardada con su historial y podés reactivarla.',
    },
    {
      id: 'delete',
      name: 'Eliminar',
      destructive: true,
      effect: { label: 'Se borra el historial', tone: 'red' },
      description:
        'Borra la cuenta con sus movimientos y transferencias. Si sólo querés dejar de usarla, archivala.',
    },
  ] satisfies AccountHelpAction[],

  actionsFootnote:
    'No siempre vas a ver todas: «Hacer predeterminada» no aparece en la cuenta que ya lo es, «Transferir» necesita al menos dos cuentas y «Archivar» no se ofrece sobre tu última cuenta activa.',

  faq: [
    {
      question: 'El saldo de la app no coincide con el de mi banco.',
      answer: 'Reajustá esa cuenta y decí cuánto tenés de verdad.',
    },
    {
      question: '¿Una cuenta puede quedar en negativo?',
      answer: 'Sí. Un banco en descubierto es plata real: el saldo se muestra en rojo y resta del total.',
    },
    {
      question: '¿Archivar o eliminar?',
      answer:
        'Archivar si dejaste de usar la cuenta pero querés conservar su historial. Eliminar sólo si la cargaste por error.',
    },
  ] satisfies HelpFaqItem[],
}
