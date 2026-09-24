/**
 * De dónde viene un movimiento — Bloque 2 del arreglo de Movimientos (docs/qa/movimientos.md). Hasta
 * acá, Movimientos no sabía si una fila venía de pagar un fijo, una tarjeta, una cuota, una deuda o
 * un ajuste de saldo: editarla o borrarla ahí nunca avisaba ni sincronizaba el origen (MO-02 a
 * MO-08). `rpc_transaction_origin` (`20260924030001_movimientos_origen.sql`) contesta esa pregunta
 * con una sola consulta; este módulo la interpreta — funciones puras, sin red, mismo criterio que
 * `aggregate.ts`.
 */
import { formatMoney } from '@/lib/money'
import { confirmDeleteMovementCopy, type ConfirmDeleteMovementCopy } from './aggregate'

export type TransactionOrigin =
  | { kind: 'fixed_payment' }
  | { kind: 'fixed_saving' }
  | { kind: 'card_payment'; cardId: string; cardName: string; period: string; movementCount: number; totalCents: number }
  | { kind: 'installment'; purchaseId: string; purchaseDescription: string; period: string }
  | { kind: 'receivable_expensed'; receivableId: string; personName: string }
  | { kind: 'receivable_share'; receivableId: string; personName: string }
  | { kind: 'receivable_payment'; paymentId: string; personName: string }
  | { kind: 'adjustment' }
  | { kind: 'plain' }

const PLAIN_ORIGIN: TransactionOrigin = { kind: 'plain' }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Valida el `jsonb` que devuelve `rpc_transaction_origin` en el borde, en vez de confiar en el tipo
 *  ancho de `database.types.ts` — un `kind` desconocido (una versión más nueva de la base contra un
 *  front más viejo, por ejemplo) cae a `plain`: el movimiento se trata como suelto, no se rompe. */
export function parseTransactionOrigin(raw: unknown): TransactionOrigin {
  if (!isRecord(raw) || typeof raw.kind !== 'string') return PLAIN_ORIGIN

  switch (raw.kind) {
    case 'fixed_payment':
      return { kind: 'fixed_payment' }
    case 'fixed_saving':
      return { kind: 'fixed_saving' }
    case 'card_payment':
      return {
        kind: 'card_payment',
        cardId: str(raw.cardId),
        cardName: str(raw.cardName),
        period: str(raw.period),
        movementCount: num(raw.movementCount),
        totalCents: num(raw.totalCents),
      }
    case 'installment':
      return {
        kind: 'installment',
        purchaseId: str(raw.purchaseId),
        purchaseDescription: str(raw.purchaseDescription),
        period: str(raw.period),
      }
    case 'receivable_expensed':
      return { kind: 'receivable_expensed', receivableId: str(raw.receivableId), personName: str(raw.personName) }
    case 'receivable_share':
      return { kind: 'receivable_share', receivableId: str(raw.receivableId), personName: str(raw.personName) }
    case 'receivable_payment':
      return { kind: 'receivable_payment', paymentId: str(raw.paymentId), personName: str(raw.personName) }
    case 'adjustment':
      return { kind: 'adjustment' }
    default:
      return PLAIN_ORIGIN
  }
}

export interface MovementFieldLocks {
  /** El importe no se puede tocar desde acá — se cambia desde la pantalla de origen. */
  lockAmount: boolean
  /** El tipo (Gasto/Ingreso) no se puede cambiar. */
  lockType: boolean
  /** Nota que explica el vínculo, o `null` si no aplica (movimiento suelto). */
  note: string | null
}

/**
 * Qué se puede tocar del formulario según el origen, y qué nota mostrar. `fixed_payment`/
 * `fixed_saving` dejan el importe editable a propósito: un trigger en la base
 * (`trg_transactions_sync_linked_fixed_expense`) sincroniza el pago/guardado — es el Bloque 1 del QA
 * de Fijos. Los demás orígenes (Bloque 4 del arreglo de Movimientos, MO-03/MO-07/MO-08) sí bloquean
 * el importe: no hay ningún trigger que reparta un cambio de importe entre "tu parte" y la deuda, o
 * entre una categoría y otra de un pago de tarjeta — cambiarlo desde acá sólo podía descuadrar el
 * origen en silencio.
 */
export function movementFieldLocks(origin: TransactionOrigin): MovementFieldLocks {
  switch (origin.kind) {
    case 'fixed_payment':
      return {
        lockAmount: false,
        lockType: true,
        note:
          'Este movimiento viene de pagar un fijo: cambiar el importe actualiza el pago. Si lo eliminás, el fijo vuelve a quedar pendiente. El tipo (Gasto/Ingreso) no se puede cambiar.',
      }
    case 'fixed_saving':
      return {
        lockAmount: false,
        lockType: true,
        note:
          'Este movimiento es un guardado para un fijo: cambiar el importe actualiza el guardado. Si lo eliminás, esa plata deja de estar apartada. El tipo (Gasto/Ingreso) no se puede cambiar.',
      }
    case 'card_payment':
      return {
        lockAmount: true,
        lockType: true,
        note: `Es parte del pago de ${origin.cardName} de este período. Para cambiar el importe, deshacé el pago desde Mis Deudas y volvé a pagarlo.`,
      }
    case 'installment':
      return {
        lockAmount: true,
        lockType: true,
        note: `Es el pago de «${origin.purchaseDescription}». Para cambiar el importe, deshacé el pago desde Mis Deudas.`,
      }
    case 'receivable_expensed':
      return {
        lockAmount: true,
        lockType: true,
        note: `Es el gasto que descontaste de la deuda de ${origin.personName}. Para cambiar el importe, deshacé el descuento desde Me Deben.`,
      }
    case 'receivable_share':
      return {
        lockAmount: true,
        lockType: true,
        note: `Es tu parte de un gasto compartido con ${origin.personName}. Para cambiar el reparto, eliminalo y cargalo de nuevo.`,
      }
    case 'receivable_payment':
      return {
        lockAmount: true,
        lockType: true,
        note: `Es el cobro de ${origin.personName} en Me Deben. Para cambiar el importe, eliminalo desde ahí.`,
      }
    case 'adjustment':
      // No debería llegar acá: Movimientos abre `MovementDetailDialog` para un ajuste, no este
      // formulario (D1). Se deja bloqueado igual, por si algún día se llega a este caso.
      return { lockAmount: true, lockType: true, note: null }
    case 'plain':
    default:
      return { lockAmount: false, lockType: false, note: null }
  }
}

export type OriginDeleteAction =
  | 'unmarkFixedPayment'
  | 'deleteFixedSaving'
  | 'unmarkCardPayment'
  | 'unmarkInstallment'
  | 'unexpenseReceivable'
  | 'deleteReceivablePayment'
  | 'delete'

/** Qué acción dispara «Eliminar» — el Bloque 3 del arreglo de Movimientos conecta cada una con la
 *  RPC de deshacer que ya usa la pantalla de origen (Mis Deudas, Me Deben), en vez de un `delete`
 *  directo que dejaba el origen desincronizado (MO-02, MO-04, MO-05, MO-06). */
export function originDeleteAction(origin: TransactionOrigin): OriginDeleteAction {
  switch (origin.kind) {
    case 'fixed_payment':
      return 'unmarkFixedPayment'
    case 'fixed_saving':
      return 'deleteFixedSaving'
    case 'card_payment':
      return 'unmarkCardPayment'
    case 'installment':
      return 'unmarkInstallment'
    case 'receivable_expensed':
      return 'unexpenseReceivable'
    case 'receivable_payment':
      return 'deleteReceivablePayment'
    case 'receivable_share':
    case 'adjustment':
    case 'plain':
    default:
      return 'delete'
  }
}

/** Texto de la confirmación antes de eliminar, según el origen. `fixed_payment`/`fixed_saving`/
 *  `plain` reusan `confirmDeleteMovementCopy` (mismo copy que ya mostraba `ConfirmDeleteMovementDialog`
 *  desde el Bloque 1); los orígenes nuevos (Bloque 3) tienen el suyo — la de tarjeta avisa que se
 *  deshace el PERÍODO ENTERO, no sólo este movimiento, porque `rpc_unmark_credit_card_paid` borra
 *  todos los movimientos que generó ese pago. */
export function originDeleteCopy(origin: TransactionOrigin, description: string | null): ConfirmDeleteMovementCopy {
  switch (origin.kind) {
    case 'fixed_payment':
      return confirmDeleteMovementCopy({ kind: 'payment', description })
    case 'fixed_saving':
      return confirmDeleteMovementCopy({ kind: 'saving', description })
    case 'card_payment': {
      const plural = origin.movementCount === 1 ? '' : 's'
      return {
        title: '¿Deshacer el pago de esta tarjeta?',
        confirmLabel: 'Deshacer pago',
        paragraphs: [
          `${origin.cardName} vuelve a quedar pendiente este período: se ${origin.movementCount === 1 ? 'borra' : 'borran'} ${origin.movementCount} movimiento${plural} por un total de ${formatMoney(origin.totalCents)}, no sólo este.`,
        ],
      }
    }
    case 'installment':
      return {
        title: '¿Deshacer el pago de esta cuota?',
        confirmLabel: 'Deshacer pago',
        paragraphs: [`«${origin.purchaseDescription}» vuelve a quedar pendiente este período.`],
      }
    case 'receivable_expensed':
      return {
        title: '¿Deshacer el descuento de esta deuda?',
        confirmLabel: 'Deshacer descuento',
        paragraphs: [`La deuda de ${origin.personName} deja de estar descontada de tu saldo, en Me Deben.`],
      }
    case 'receivable_share':
      return {
        title: '¿Eliminar este gasto?',
        confirmLabel: 'Eliminar',
        paragraphs: [
          `Es tu parte de un gasto compartido con ${origin.personName} — la deuda sigue en Me Deben. Para cambiar el reparto, cargalo de nuevo.`,
        ],
      }
    case 'receivable_payment':
      return {
        title: '¿Eliminar este cobro?',
        confirmLabel: 'Eliminar',
        paragraphs: [`El abono de ${origin.personName} en Me Deben queda sin este ingreso.`],
      }
    case 'adjustment':
      return {
        title: '¿Eliminar este ajuste?',
        confirmLabel: 'Eliminar ajuste',
        paragraphs: ['La cuenta vuelve al saldo que tenía antes de este ajuste.'],
      }
    case 'plain':
    default:
      return confirmDeleteMovementCopy({ kind: 'plain', description })
  }
}
