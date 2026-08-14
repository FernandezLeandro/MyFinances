/**
 * Función pura, separada de la red a propósito — mismo criterio que `credits/aggregate.ts` y
 * `reconciliation/aggregate.ts`: se verifica con números a mano sin levantar la app. Reproduce
 * EXACTAMENTE la lógica del cuarto término de `rpc_projected_balance` (ver la migración
 * `20260808060001_spending_budgets.sql`) para que el número grande del panel y esta función nunca
 * se desincronicen. `today` entra por parámetro, no `new Date()` adentro, para poder testearlo —
 * mismo criterio que `permiteActualizarPlantilla` en `fixed-expenses/period.ts`.
 */
import { endOfMonth, startOfMonth } from 'date-fns'

export interface BudgetProjection {
  /** Presupuesto mensual dividido los días del mes de `period` — informativo, "$X por día". */
  dailyCents: number
  /** Días que faltan del mes de `period` respecto de `today`, hoy incluido. 0 si `period` ya pasó. */
  remainingDays: number
  /** Lo que el saldo proyectado descuenta: `monthlyCents × remainingDays / díasDelMes`, redondeado
   *  una sola vez al final — no como `dailyCents × remainingDays`, para no doble-redondear distinto
   *  de como lo hace el RPC. */
  remainingCents: number
}

function daysInMonth(date: Date): number {
  return endOfMonth(date).getDate()
}

export function projectBudget(monthlyCents: number, period: Date, today: Date): BudgetProjection {
  const totalDays = daysInMonth(period)
  const dailyCents = Math.round(monthlyCents / totalDays)

  const periodMonth = startOfMonth(period)
  const todayMonth = startOfMonth(today)

  let remainingDays: number
  if (periodMonth < todayMonth) {
    remainingDays = 0
  } else if (periodMonth > todayMonth) {
    remainingDays = totalDays
  } else {
    remainingDays = totalDays - today.getDate() + 1
  }

  const remainingCents = Math.round((monthlyCents * remainingDays) / totalDays)

  return { dailyCents, remainingDays, remainingCents }
}
