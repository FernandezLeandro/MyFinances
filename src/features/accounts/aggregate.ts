/**
 * Lógica pura de Cuentas — sin red ni React, separada a propósito (mismo criterio que
 * `credits/aggregate.ts`) para verificarla con números a mano. Acá viven los datos que se pueden
 * invertir o pisar sin querer: el signo de un reajuste, qué cuenta viene elegida, cuándo se pide
 * cuenta y qué se le dice a quien va a eliminar una.
 */
import { z } from 'zod'
import { parseAmountToCents } from '@/lib/money'
import type { MovementPeriod } from '@/features/transactions/movementPeriod'
import type { AccountKind, BalanceLocation } from './api'

// ---------------------------------------------------------------------------------------------
// Nombre según el tipo
// ---------------------------------------------------------------------------------------------

/** Lo que se autocompleta en el nombre al elegir cada tipo: sólo Efectivo tiene un nombre obvio. */
const AUTO_NAME: Record<AccountKind, string> = { cash: 'Efectivo', wallet: '', bank: '' }

/** Al cambiar de tipo, el nombre sigue al tipo mientras no lo haya tocado el usuario: vacío o el
 *  autocompletado del tipo anterior ("Efectivo"). Un nombre propio ("Caja fuerte") se respeta. */
export function nameForKindChange(prevKind: AccountKind, nextKind: AccountKind, name: string): string {
  if (prevKind === nextKind) return name
  const trimmed = name.trim()
  const isAuto = trimmed === '' || trimmed === AUTO_NAME[prevKind]
  return isAuto ? AUTO_NAME[nextKind] : name
}

/** Nombre inicial de una cuenta nueva (el tipo por defecto es Efectivo). */
export const DEFAULT_NEW_ACCOUNT_KIND: AccountKind = 'cash'
export const DEFAULT_NEW_ACCOUNT_NAME = AUTO_NAME[DEFAULT_NEW_ACCOUNT_KIND]

// ---------------------------------------------------------------------------------------------
// Cuenta predeterminada y totales
// ---------------------------------------------------------------------------------------------

/** La cuenta que viene elegida en los formularios: la predeterminada activa, si no la activa más
 *  vieja, si no `''`. Mismo orden que el trigger `transactions_account` de la base, que completa
 *  la cuenta cuando llega un movimiento sin una. Una archivada nunca viene elegida. */
export function effectiveDefaultAccountId(locations: readonly BalanceLocation[]): string {
  const active = locations.filter((l) => !l.is_archived)
  const explicit = active.find((l) => l.is_default)
  if (explicit) return explicit.id
  const oldest = [...active].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]
  return oldest?.id ?? ''
}

export interface AccountsTotals {
  activeCents: number
  archivedCents: number
  /** Es el saldo actual de la app: las archivadas también suman. */
  totalCents: number
}

/** Suma de los saldos por cuenta. Sin dato derivado (todavía cargando o cuenta recién creada) cae en
 *  la apertura, que es exactamente lo que vale una cuenta sin movimientos. */
export function accountsTotals(locations: readonly BalanceLocation[], derivedCents: ReadonlyMap<string, number>): AccountsTotals {
  let activeCents = 0
  let archivedCents = 0
  for (const l of locations) {
    const cents = derivedCents.get(l.id) ?? l.openingCents
    if (l.is_archived) archivedCents += cents
    else activeCents += cents
  }
  return { activeCents, archivedCents, totalCents: activeCents + archivedCents }
}

// ---------------------------------------------------------------------------------------------
// Reajustar el saldo
// ---------------------------------------------------------------------------------------------

export interface AdjustmentPlan {
  /** `real − actual`. Positivo → tenés más de lo que la app sabe; negativo → menos. */
  diffCents: number
  /** El movimiento de ajuste que se registraría, o `null` si no hay diferencia. Un saldo real mayor
   *  es un INGRESO y uno menor es un GASTO — este es el signo que no se puede invertir. */
  movement: { type: 'income' | 'expense'; cents: number } | null
  /** La apertura resultante si se elige "corregir el saldo inicial". */
  newOpeningCents: number
}

export function planAdjustment(input: { derivedCents: number; openingCents: number; realCents: number }): AdjustmentPlan {
  const diffCents = input.realCents - input.derivedCents
  return {
    diffCents,
    movement: diffCents === 0 ? null : { type: diffCents > 0 ? 'income' : 'expense', cents: Math.abs(diffCents) },
    newOpeningCents: input.openingCents + diffCents,
  }
}

// ---------------------------------------------------------------------------------------------
// Archivar y eliminar
// ---------------------------------------------------------------------------------------------

/** No se archiva la última cuenta activa: los movimientos nuevos no tendrían cuenta para elegir.
 *  Se llama sólo para una cuenta activa (reactivar no tiene bloqueo). */
export function archiveBlocker(activeCount: number): 'last-active' | null {
  return activeCount <= 1 ? 'last-active' : null
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/** Qué se lleva puesto eliminar una cuenta. */
export function deleteImpactText(counts: { transactions: number; transfers: number }, isLastAccount: boolean): string {
  const { transactions, transfers } = counts
  const parts: string[] = []
  if (transactions > 0) parts.push(plural(transactions, 'movimiento', 'movimientos'))
  if (transfers > 0) parts.push(plural(transfers, 'transferencia', 'transferencias'))

  let text: string
  if (parts.length === 0) text = 'No tiene movimientos ni transferencias.'
  else text = `Se ${transactions + transfers === 1 ? 'borra' : 'borran'} ${parts.join(' y ')}.`

  if (isLastAccount) {
    text += ' Es tu última cuenta: sin cuentas, el saldo vuelve a ser la suma de todos tus movimientos.'
  }
  return text
}

// ---------------------------------------------------------------------------------------------
// Selector de cuenta en los formularios
// ---------------------------------------------------------------------------------------------

/** `hidden`: no se muestra (el plan no tiene cuentas, o todavía no hay ninguna).
 *  `required`: hay que elegir una (viene la predeterminada).
 *  `legacy`: un movimiento viejo sin cuenta que se está editando — no se le pide una, porque
 *  asignársela contaría esa plata dos veces (ya está en la apertura de las cuentas). */
export type AccountFieldMode = 'hidden' | 'required' | 'legacy'

export function accountFieldMode(input: {
  canCuentas: boolean
  activeCount: number
  isEditing: boolean
  txAccountId: string | null
}): AccountFieldMode {
  if (!input.canCuentas) return 'hidden'
  if (input.isEditing) {
    if (input.txAccountId) return 'required'
    return input.activeCount > 0 ? 'legacy' : 'hidden'
  }
  return input.activeCount > 0 ? 'required' : 'hidden'
}

export interface AccountSelectGroup {
  kind: AccountKind
  accounts: { id: string; name: string; archived: boolean }[]
}

const KIND_ORDER: readonly AccountKind[] = ['cash', 'wallet', 'bank']

/** Las cuentas activas agrupadas por tipo, más la actual si está archivada — así editar un
 *  movimiento cuya cuenta se archivó no la hace desaparecer del selector (y pisarla al guardar). */
export function accountSelectGroups(locations: readonly BalanceLocation[], currentValue: string): AccountSelectGroup[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    accounts: locations
      .filter((l) => l.kind === kind && (!l.is_archived || l.id === currentValue))
      .map((l) => ({ id: l.id, name: l.name, archived: l.is_archived })),
  })).filter((g) => g.accounts.length > 0)
}

// ---------------------------------------------------------------------------------------------
// Ver los movimientos de una cuenta
// ---------------------------------------------------------------------------------------------

/** El `state` que Movimientos ya acepta al navegar: filtra por la cuenta y abre todo el historial,
 *  no sólo el mes actual. */
export function movimientosDeCuentaState(accountId: string, today: string): { accountIds: string[]; period: MovementPeriod } {
  return {
    accountIds: [accountId],
    period: { preset: 'custom', anchor: today, from: '2000-01-01', to: today },
  }
}

// ---------------------------------------------------------------------------------------------
// Formulario de alta/edición
// ---------------------------------------------------------------------------------------------

/** Tope de `numeric(12, 2)` en centavos. */
const MAX_ABS_CENTS = 1e12

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, 'Falta el nombre').max(60, 'Máximo 60 caracteres'),
  kind: z.enum(['cash', 'wallet', 'bank']),
  /** Cuánto tenés hoy. Puede ser negativo (un banco en descubierto es plata real). Sólo en el alta. */
  opening: z.string().refine(
    (v) => {
      const cents = parseAmountToCents(v)
      return cents !== null && Math.abs(cents) < MAX_ABS_CENTS
    },
    { message: 'Ingresá un importe válido' },
  ),
})

export type AccountFormValues = z.infer<typeof accountFormSchema>
