/**
 * Funciones puras de "Sueldo" (Básico) — separadas de la red a propósito, mismo criterio que el
 * resto de `aggregate.ts` en la app.
 *
 * HO-10/HO-11 del QA de Hoy, con D1 (decisión de Lean, 2026-09-24): «Sueldo asignado» y el diálogo
 * de Sueldo mostraban cifras DISTINTAS para lo que la UI presenta como el mismo concepto — la
 * tarjeta usaba `totalIncome` de `v_range_summary` (todo ingreso no-ajuste del ciclo) y el diálogo
 * sumaba TODOS los ingresos, ajustes incluidos. Se unifican en una sola definición: `isCycleIncome`,
 * la misma que ya usa `v_range_summary` (`type = 'income' and not is_adjustment`) — así la tarjeta y
 * el diálogo siempre coinciden, sin importar cuál se mire primero.
 */
import type { Transaction } from '@/features/transactions/api'

/** Un ingreso del ciclo — la misma regla que `v_range_summary.total_income`
 *  (`type = 'income' and not is_adjustment`). Incluye cualquier ingreso, no sólo el cargado desde
 *  "Asignar sueldo" (una venta suelta, un "Me devolvió X" de Me Deben): en Básico no hay otra forma
 *  de cargarlos, así que también son plata disponible para los fijos de este ciclo. */
export function isCycleIncome(tx: Pick<Transaction, 'type' | 'is_adjustment'>): boolean {
  return tx.type === 'income' && !tx.is_adjustment
}

/** HO-11: la X del diálogo borraba cualquier fila al toque, sin distinguir un sueldo cargado ahí de
 *  un ingreso con vida propia en otra pantalla (un ajuste histórico de Cuentas, en el caso real que
 *  encontró el QA). Removible sólo si no tiene categoría ni viene de pagar un fijo — lo que arma
 *  "Asignar sueldo" nace así (`categoryId: null`, sin `fixedExpensePaymentId`); cualquier fila con
 *  alguno de los dos vino de otro lado y se edita/borra desde ahí. */
export function isRemovableFromDialog(tx: Pick<Transaction, 'category_id' | 'fixed_expense_payment_id'>): boolean {
  return tx.category_id == null && tx.fixed_expense_payment_id == null
}
