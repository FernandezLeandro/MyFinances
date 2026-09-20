/**
 * Lógica pura de Cuentas — sin red ni React, separada a propósito (mismo criterio que
 * `credits/aggregate.ts`) para verificarla con números a mano. Acá viven los datos que se pueden
 * invertir o pisar sin querer: el signo de un reajuste, qué cuenta viene elegida, cuándo se pide
 * cuenta y qué se le dice a quien va a eliminar una.
 */
import { z } from 'zod'
import { formatMoney, parseAmountToCents } from '@/lib/money'
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
  /** Lo que tienen las archivadas: se muestra en su lista, pero NO entra en el total. */
  archivedCents: number
  /** Es el saldo actual de la app (`rpc_current_balance`): sólo las cuentas activas. Archivar una la
   *  saca de acá; reactivarla la vuelve a sumar. */
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
  return { activeCents, archivedCents, totalCents: activeCents }
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
  name: z.string().trim().min(1, 'Ponele un nombre a la cuenta.').max(60, 'Máximo 60 caracteres'),
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

// ---------------------------------------------------------------------------------------------
// Reajustar: formulario y aviso
// ---------------------------------------------------------------------------------------------

/** Tope de `numeric(12, 2)` en centavos — el RPC de reajuste rechaza `abs >= 1e10` en pesos. */
const MAX_ABS_CENTS_ADJUST = 1e12

export interface AdjustFormState {
  /** Se puede mandar: el importe se entiende y mueve el saldo. */
  canSubmit: boolean
  /** Sólo cuando lo escrito NO es un importe (vacío, letras, fuera de rango) — se muestra al lado
   *  del campo, en rojo. Un saldo igual al actual no es un error: el botón queda apagado sin gritar,
   *  porque el campo arranca precargado con ese mismo valor. */
  error: string | null
}

/** Estado del formulario de "Reajustar saldo" (validación dentro del diálogo, patrón 5b).
 *
 *  Un saldo real de cero o negativo ES válido: quien gastó todo lo que tenía, o está en descubierto
 *  en el banco, tiene que poder reajustar hacia ahí. Por eso NO se exige `> 0`. */
export function adjustFormState(realInput: string, derivedCents: number): AdjustFormState {
  const realCents = parseAmountToCents(realInput)
  if (realCents === null || Math.abs(realCents) >= MAX_ABS_CENTS_ADJUST) {
    return { canSubmit: false, error: 'Ingresá un importe válido para poder reajustar.' }
  }
  return { canSubmit: realCents !== derivedCents, error: null }
}

/** El aviso de archivar. Archivar saca la cuenta del saldo, y como no hay un diálogo de confirmación
 *  que lo explique, lo dice el aviso: cuánto baja el total (o que no cambia, si estaba en cero). */
export function archiveResultText(accountName: string, balanceCents: number): { title: string; detail: string } {
  const name = accountName || 'La cuenta'
  return {
    title: 'Cuenta archivada',
    detail:
      balanceCents === 0
        ? `${name} deja de ofrecerse al cargar algo nuevo.`
        : `${name} deja de sumar a tu saldo: el total ${balanceCents > 0 ? 'baja' : 'sube'} ${formatMoney(Math.abs(balanceCents))}.`,
  }
}

/** El aviso de reactivar: la cuenta vuelve a sumar, así que el total se mueve por su saldo. */
export function reactivateResultText(accountName: string, balanceCents: number): { title: string; detail: string } {
  const name = accountName || 'La cuenta'
  return {
    title: 'Cuenta reactivada',
    detail:
      balanceCents === 0
        ? `${name} vuelve a ofrecerse al cargar algo nuevo.`
        : `${name} vuelve a sumar a tu saldo: el total ${balanceCents > 0 ? 'sube' : 'baja'} ${formatMoney(Math.abs(balanceCents))}.`,
  }
}

/** El aviso de un reajuste que salió bien: título y detalle del toast. */
export function adjustResultText(input: {
  accountName: string
  realCents: number
  diffCents: number
  mode: 'movement' | 'opening'
}): { title: string; detail: string } {
  const queda = `${input.accountName || 'La cuenta'} queda en ${formatMoney(input.realCents)}`
  const detail =
    input.mode === 'movement'
      ? `${queda} · ajuste de ${formatMoney(Math.abs(input.diffCents))}`
      : `${queda} · saldo inicial corregido`
  return { title: 'Saldo reajustado', detail }
}

// ---------------------------------------------------------------------------------------------
// La grilla: orden, colores y composición
// ---------------------------------------------------------------------------------------------

export interface AccountsGrid {
  /** Las activas, con la predeterminada primero y el resto en el orden en que vienen. */
  accounts: BalanceLocation[]
  archived: BalanceLocation[]
  /** La que viene elegida en los formularios (la predeterminada, o la activa más vieja si ninguna
   *  lo es explícitamente). `''` sin cuentas activas. */
  defaultId: string
}

export function accountsForGrid(locations: readonly BalanceLocation[]): AccountsGrid {
  const active = locations.filter((l) => !l.is_archived)
  const defaultId = effectiveDefaultAccountId(locations)
  const first = active.find((l) => l.id === defaultId)
  return {
    accounts: first ? [first, ...active.filter((l) => l.id !== first.id)] : active,
    archived: locations.filter((l) => l.is_archived),
    defaultId,
  }
}

/** Paleta de categorías que se reusa para las cuentas. Se salta `cat-2`: es el coral de "gasto",
 *  y una cuenta en rojo se leería como una alerta que no es. */
const ACCOUNT_COLOR_SLOTS = [1, 3, 5, 4, 6] as const

/** El color de la cuenta en la posición `position` de la lista (activas, después archivadas). Es por
 *  POSICIÓN y no por tipo: dos bancos son dos colores distintos. Da vuelta si hay más de cinco. */
export function accountColor(position: number): string {
  return `var(--c-cat-${ACCOUNT_COLOR_SLOTS[position % ACCOUNT_COLOR_SLOTS.length]})`
}

export interface CompositionSlice {
  id: string
  name: string
  cents: number
  /** 0–100, sin redondear: es el ancho del segmento de la barra. */
  pct: number
  color: string
}

/** De qué está hecho el total: una porción por cuenta ACTIVA con saldo positivo. Las archivadas no
 *  entran porque el total no las cuenta.
 *
 *  Un saldo negativo o cero no aporta porción (no hay "ancho negativo"), pero SÍ ocupa su lugar en
 *  la lista de colores, así el color de una cuenta no cambia cuando otra pasa a cero. */
export function accountComposition(
  locations: readonly BalanceLocation[],
  derivedCents: ReadonlyMap<string, number>,
): CompositionSlice[] {
  const { accounts } = accountsForGrid(locations)
  const ordered = accounts.map((l, position) => ({
    l,
    position,
    cents: derivedCents.get(l.id) ?? l.openingCents,
  }))
  const positive = ordered.filter((x) => x.cents > 0)
  const total = positive.reduce((sum, x) => sum + x.cents, 0)
  if (total <= 0) return []
  return positive.map(({ l, position, cents }) => ({
    id: l.id,
    name: l.name,
    cents,
    pct: (cents / total) * 100,
    color: accountColor(position),
  }))
}

/** Qué tamaño de cifra lleva el total en la columna angosta (340px) de escritorio. `total` es de 46px
 *  fijos y entra hasta 7 dígitos enteros; más largo se desbordaría de la tarjeta, así que baja a
 *  `figure`, que se achica solo. Cuenta el signo menos como un dígito más. Una sola pasada sobre el
 *  texto, sin medir el DOM. */
export function totalFigureSize(cents: number): 'total' | 'figure' {
  const integerDigits = String(Math.trunc(Math.abs(cents) / 100)).length + (cents < 0 ? 1 : 0)
  return integerDigits <= 7 ? 'total' : 'figure'
}

/** El porcentaje de la leyenda: entero, y "<1%" para lo que existe pero redondearía a cero. */
export function formatShare(pct: number): string {
  if (pct > 0 && pct < 1) return '<1%'
  return `${Math.round(pct)}%`
}

// ---------------------------------------------------------------------------------------------
// El menú de la cuenta
// ---------------------------------------------------------------------------------------------

export type AccountMenuActionId = 'adjust' | 'edit' | 'setDefault' | 'transfer' | 'viewMovements' | 'archive' | 'delete'
type MenuTone = 'default' | 'quiet' | 'destructive'

export type AccountMenuEntry =
  | { kind: 'action'; id: AccountMenuActionId; label: string; tone: MenuTone }
  | { kind: 'divider' }

/** Los ítems del menú `⋯` de una cuenta ACTIVA, en orden. Una sola fuente para el popover de
 *  escritorio y la hoja del celular.
 *
 *  - "Reajustar saldo" es el botón de la tarjeta, así que en el popover no está; en la hoja sí y va
 *    primero, porque ahí es el único menú.
 *  - "Archivar" no se ofrece sobre la última cuenta activa (`archiveBlocker`): los movimientos
 *    nuevos se quedarían sin una cuenta para elegir.
 *  - "Hacer predeterminada" no se ofrece sobre la que ya lo es; "Transferir" pide otra cuenta a la
 *    que mandar. */
export function accountMenuEntries(input: {
  surface: 'popover' | 'sheet'
  isDefault: boolean
  activeCount: number
}): AccountMenuEntry[] {
  const action = (id: AccountMenuActionId, label: string, tone: MenuTone = 'default'): AccountMenuEntry => ({
    kind: 'action',
    id,
    label,
    tone,
  })

  const entries: AccountMenuEntry[] = []
  if (input.surface === 'sheet') entries.push(action('adjust', 'Reajustar saldo'))
  entries.push(action('edit', 'Editar cuenta'))
  if (!input.isDefault) entries.push(action('setDefault', 'Hacer predeterminada'))
  if (input.activeCount >= 2) entries.push(action('transfer', 'Transferir desde acá'))
  entries.push(action('viewMovements', 'Ver movimientos'))
  entries.push({ kind: 'divider' })
  if (archiveBlocker(input.activeCount) === null) entries.push(action('archive', 'Archivar', 'quiet'))
  entries.push(action('delete', 'Eliminar', 'destructive'))
  return entries
}
