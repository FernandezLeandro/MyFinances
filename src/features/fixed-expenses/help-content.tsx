import type { HelpAction, HelpFaqItem, HelpLegendItem } from '@/components/help/types'

/**
 * El texto de la ayuda de Fijos. Corto a propósito: la anatomía de la pantalla, qué hace cada acción
 * con tu saldo, y las tres dudas que más se repiten. Fijos es igual en los tres planes, así que no
 * promete cuentas ni deudas. Copy en voseo rioplatense.
 */
export const FIXED_HELP = {
  title: 'Cómo usar Fijos',
  intro:
    'Fijos es lo que pagás todos los meses: alquiler, servicios, suscripciones. Lo tildás cuando lo pagás y la app te dice cuánto falta.',

  legend: [
    { lead: 'Falta pagar.', body: 'Lo que queda del período. La barra, cuánto ya pagaste.' },
    { lead: 'Por vencimiento.', body: 'Atrasado, esta semana y más adelante.' },
    { lead: 'El casillero.', body: 'Tocalo para pagar. Tildado, tocalo para quitar el pago.' },
    {
      lead: 'Recurrentes.',
      body: 'Un presupuesto que gastás de a poco, como la nafta. El + suma una carga.',
    },
    { lead: 'Saldo proyectado.', body: 'Tu saldo menos lo que falta pagar.' },
  ] satisfies HelpLegendItem[],

  actionsSubtitle: 'Todas salen del casillero o del + de cada fijo.',

  actions: [
    {
      id: 'pay',
      name: 'Pagar',
      effect: { label: 'El proyectado no cambia', tone: 'accent' },
      description:
        'Queda como gasto en Movimientos. Si pagás otro importe, el fijo pasa a ese importe de ahí en adelante.',
    },
    {
      id: 'load',
      name: 'Registrar carga',
      effect: { label: 'El proyectado no cambia', tone: 'accent' },
      description: 'En un recurrente, cada carga es un gasto. Si te pasás del presupuesto, el exceso se ve en rojo.',
    },
    {
      id: 'save',
      name: 'Sólo guardar plata',
      effect: { label: 'Se descuenta al pagar', tone: 'neutral' },
      description:
        'Para juntar de a poco antes del vencimiento. Está abajo de todo al pagar un fijo de una vez.',
    },
    {
      id: 'unmark',
      name: 'Quitar el pago',
      effect: { label: 'Vuelve a pendiente', tone: 'amber' },
      description: 'Se borra el gasto que el pago había creado en Movimientos.',
    },
  ] satisfies HelpAction[],

  faq: [
    {
      question: 'Pagué un fijo y el saldo proyectado no cambió.',
      answer: 'Es a propósito: ya estaba descontado. Al pagar baja tu saldo y baja lo que falta pagar, por igual.',
    },
    {
      question: 'Este mes pagué otro importe.',
      answer:
        'Ese mes queda con lo que pagaste y el fijo pasa a ese importe. Si marcás un mes pasado, el importe del fijo no se toca.',
    },
    {
      question: '¿Pausar o eliminar?',
      answer:
        'Pausar si por un tiempo no lo pagás: deja de aparecer y de sumar, y lo reactivás desde Editar. Eliminar sólo si fue un error: borra su historial de pagos, los movimientos quedan.',
    },
  ] satisfies HelpFaqItem[],
}
