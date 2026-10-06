import type { HelpAction, HelpFaqItem, HelpLegendItem } from '@/components/help/types'

/**
 * El texto de la ayuda de Movimientos. Corta a propósito: la anatomía de la pantalla, qué suma y qué no,
 * y las tres dudas que más se repiten. Vale para todos los planes (Básico sólo ve y deshace pagos de
 * fijos), por eso habla de «ver o corregir» y no promete cargar. Copy en voseo rioplatense.
 */
export const MOVEMENTS_HELP = {
  title: 'Cómo usar Movimientos',
  intro:
    'Movimientos es el historial de tu plata: cada gasto e ingreso del período, día por día. Buscás, filtrás y tocás una fila para verla o corregirla.',

  legend: [
    { lead: 'El período.', body: 'Las flechas cambian de período. Otro rango, desde Filtros.' },
    {
      lead: 'El resumen.',
      body: 'Neto, ingresos, gastos y promedio diario del período entero. En el celular está plegado.',
    },
    { lead: 'Buscar y filtrar.', body: 'Por texto, tipo, categoría, cuenta o período.' },
    { lead: 'Filtros activos.', body: 'Una píldora por filtro: la ✕ lo saca.' },
    { lead: 'Cada día.', body: 'Con su neto. Tocá una fila para ver o corregir ese movimiento.' },
  ] satisfies HelpLegendItem[],

  kindsSubtitle: 'No todo lo que ves en la lista entra en las cuentas del resumen.',

  kinds: [
    {
      id: 'movement',
      name: 'Gasto o ingreso',
      effect: { label: 'Suma al resumen', tone: 'accent' },
      description: 'Lo que cargás o sale de pagar un fijo. Tocalo para verlo, editarlo o borrarlo.',
    },
    {
      id: 'transfer',
      name: 'Transferencia',
      effect: { label: 'No suma', tone: 'neutral' },
      description:
        'Plata que pasó de una cuenta tuya a otra: no es gasto ni ingreso. Sólo aparece si usás Cuentas. Filtrando por una cuenta, sí cuenta en el neto del día.',
    },
    {
      id: 'adjustment',
      name: 'Ajuste de saldo',
      effect: { label: 'No suma', tone: 'neutral' },
      description:
        'Lo deja «Reajustar saldo» en Cuentas. No se edita: se ve el detalle o se elimina.',
    },
  ] satisfies HelpAction[],

  faq: [
    {
      question: 'Filtro y el resumen no cambia.',
      answer: 'Es a propósito: el resumen es del período entero. Los filtros sólo cambian la lista de abajo.',
    },
    {
      question: 'No encuentro un movimiento.',
      answer: 'La búsqueda mira sólo el período elegido. Ampliá el rango desde Filtros → Período.',
    },
    {
      question: '¿Qué baja «Exportar CSV»?',
      answer: 'Toda la lista con los filtros puestos, no sólo la página que ves. Las transferencias no van.',
    },
  ] satisfies HelpFaqItem[],
}

/**
 * La misma ayuda para Básico (`movimientos-manuales` apagado): ese plan no carga ni edita movimientos,
 * los suyos salen de pagar un fijo o de «Sueldo» en Hoy, y no tiene Cuentas (ni transferencias, ni
 * columna ni filtro de cuenta). Lo que no se pisa acá vale igual para los dos.
 */
export const MOVEMENTS_HELP_BASIC = {
  ...MOVEMENTS_HELP,
  intro:
    'Movimientos es el historial de lo que pagaste y cobraste, día por día. Sus movimientos salen de pagar tus fijos y de «Sueldo», en Hoy.',

  legend: [
    MOVEMENTS_HELP.legend[0],
    MOVEMENTS_HELP.legend[1],
    { lead: 'Buscar y filtrar.', body: 'Por texto, tipo, categoría o período.' },
    MOVEMENTS_HELP.legend[3],
    { lead: 'Cada día.', body: 'Con su neto. Tocá una fila para ver el detalle o deshacerla.' },
  ] satisfies HelpLegendItem[],

  kindsSubtitle: 'No todo lo que ves en la lista entra en el resumen.',

  kinds: [
    {
      id: 'payment',
      name: 'Pago de un fijo',
      effect: { label: 'Suma al resumen', tone: 'accent' },
      description: 'Sale de pagar un fijo. Tocalo para quitar el pago: el fijo vuelve a quedar pendiente.',
    },
    {
      id: 'income',
      name: 'Sueldo',
      effect: { label: 'Suma al resumen', tone: 'accent' },
      description: 'Lo cargás desde Hoy. Tocalo para corregir el importe o eliminarlo.',
    },
    {
      id: 'adjustment',
      name: 'Ajuste de saldo',
      effect: { label: 'No suma', tone: 'neutral' },
      description: 'Queda de antes de bajar de plan. No se edita: se ve el detalle o se elimina.',
    },
  ] satisfies HelpAction[],

  faq: [
    MOVEMENTS_HELP.faq[0],
    MOVEMENTS_HELP.faq[1],
    {
      question: '¿Cómo cargo un gasto?',
      answer: 'Pagando un fijo: desde Fijos o con el + de abajo. Cada pago queda acá como movimiento.',
    },
  ] satisfies HelpFaqItem[],
}
