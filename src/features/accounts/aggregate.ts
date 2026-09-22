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

/** Exportada porque también la usa `StopUsingAccountsDialog` (`AccountConfirmDialogs.tsx`). */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

export interface DeleteAccountImpact {
  movimientos: number
  transferencias: number
  /** El saldo PROPIO de la cuenta (`rpc_account_balances`), no el total de la app. Desde
   *  `20260923020001_eliminar_cuenta_solo_lo_suyo.sql`, eliminar una cuenta pliega sus transferencias
   *  en la apertura de la otra punta antes de borrarlas: ninguna otra cuenta cambia de saldo, así que
   *  el único número que hace falta es éste. */
  balanceCents: number
  /** Una archivada no suma al total (`rpc_current_balance` sólo cuenta activas): borrarla no mueve
   *  el saldo aunque tenga plata propia. */
  isArchived: boolean
}

export interface DeleteAccountDescription {
  /** "Se borran 2 movimientos y 1 transferencia. Las demás cuentas no cambian." */
  summary: string
  /** "Tu saldo baja $866.359,65." — `null` si el saldo total no se mueve (archivada, o en $0). */
  balanceChangeText: string | null
  /** Hay plata o historial de por medio: "Archivar" pasa a ser la salida recomendada, "Eliminar
   *  igual" queda como secundaria. Sin nada en juego, el botón es "Eliminar" a secas — ver `deleteLabel`. */
  recommendArchive: boolean
  /** "Eliminar" cuando no hay nada en juego (cuenta vacía, en $0); "Eliminar igual" cuando sí. */
  deleteLabel: string
}

/** Qué se lleva puesto eliminar una cuenta. Ya no hace falta un RPC de preview aparte
 *  (`rpc_account_delete_preview`, retirado en la misma migración): con el pliegue, el único efecto en
 *  otra cuenta es CERO, así que acá sólo se arma el texto a partir de datos que el cliente ya tiene
 *  (`useAccountBalances`, `useAccountTransfers`) o puede pedir con un conteo simple
 *  (`useAccountMovementCount`). Antes, una fórmula aparte en SQL calculaba "cómo queda cada cuenta
 *  afectada" y se desalineó de la real (N1 del re-test de QA: prometía que el saldo subía cuando
 *  bajaba). Sin una segunda fórmula, no hay como desalinearse. */
export function describeAccountDelete(impact: DeleteAccountImpact): DeleteAccountDescription {
  const { movimientos, transferencias, balanceCents, isArchived } = impact

  const parts: string[] = []
  if (movimientos > 0) parts.push(plural(movimientos, 'movimiento', 'movimientos'))
  if (transferencias > 0) parts.push(plural(transferencias, 'transferencia', 'transferencias'))
  const summary =
    parts.length === 0
      ? 'No tiene movimientos ni transferencias. Las demás cuentas no cambian.'
      : `Se ${movimientos + transferencias === 1 ? 'borra' : 'borran'} ${parts.join(' y ')}. Las demás cuentas no cambian.`

  const movesBalance = !isArchived && balanceCents !== 0
  const balanceChangeText = movesBalance ? `Tu saldo ${balanceCents > 0 ? 'baja' : 'sube'} ${formatMoney(Math.abs(balanceCents))}.` : null

  const somethingAtStake = movesBalance || movimientos > 0
  return {
    summary,
    balanceChangeText,
    recommendArchive: somethingAtStake,
    deleteLabel: somethingAtStake ? 'Eliminar igual' : 'Eliminar',
  }
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
// Nombre único (N6)
// ---------------------------------------------------------------------------------------------

/** Nombre duplicado entre cuentas ACTIVAS del usuario, sin distinguir mayúsculas ni espacios —
 *  mismo criterio que el índice único de la base (`balance_locations_user_name_idx`,
 *  `20260923010001_cuentas_integridad.sql`, que también sólo mira activas: una archivada puede
 *  compartir nombre con cualquier otra porque no se ofrece en ningún selector). `excludeId` es la
 *  propia cuenta al editar, para no chocar consigo misma. */
export function accountNameError(input: { name: string; locations: readonly BalanceLocation[]; excludeId?: string }): string | null {
  const normalized = input.name.trim().toLowerCase()
  if (!normalized) return null
  const clash = input.locations.some((l) => !l.is_archived && l.id !== input.excludeId && l.name.trim().toLowerCase() === normalized)
  return clash ? 'Ya tenés una cuenta activa con ese nombre.' : null
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
  /** El plan de ajuste con ese importe, o `null` cuando `error` no es `null`. Antes el diálogo
   *  calculaba el plan aparte con el mismo `realCents` que ya era inválido (M1 del QA: con 11 cifras
   *  se veían a la vez «Ingresá un importe válido…» Y «…ingreso de $100.000.000.499,00»). Con el plan
   *  adentro de este mismo estado, mostrar el error implica no tener plan que mostrar. */
  plan: AdjustmentPlan | null
}

/** Estado del formulario de "Reajustar saldo" (validación dentro del diálogo, patrón 5b).
 *
 *  Un saldo real de cero o negativo ES válido: quien gastó todo lo que tenía, o está en descubierto
 *  en el banco, tiene que poder reajustar hacia ahí. Por eso NO se exige `> 0`. */
export function adjustFormState(realInput: string, derivedCents: number, openingCents: number): AdjustFormState {
  const realCents = parseAmountToCents(realInput)
  if (realCents === null || Math.abs(realCents) >= MAX_ABS_CENTS_ADJUST) {
    return { canSubmit: false, error: 'Ingresá un importe válido para poder reajustar.', plan: null }
  }
  return { canSubmit: realCents !== derivedCents, error: null, plan: planAdjustment({ derivedCents, openingCents, realCents }) }
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
 *  - Ni "Archivar" ni "Eliminar" se ofrecen sobre la última cuenta activa (`archiveBlocker`, y desde
 *    `20260923010001_cuentas_integridad.sql` la base bloquea las dos igual): los movimientos nuevos
 *    se quedarían sin una cuenta para elegir. La única salida sobre la última es el interruptor
 *    «Cuentas» de Ajustes (`useStopUsingAccounts`), no un ítem de este menú.
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
  if (archiveBlocker(input.activeCount) === null) {
    entries.push({ kind: 'divider' })
    entries.push(action('archive', 'Archivar', 'quiet'))
    entries.push(action('delete', 'Eliminar', 'destructive'))
  }
  return entries
}

// ---------------------------------------------------------------------------------------------
// Nueva cuenta sin mover el saldo
// ---------------------------------------------------------------------------------------------

/** El nombre de la cuenta que guarda el sobrante al crear la primera. La base tiene el suyo (en
 *  `rpc_create_account`): si cambia uno, cambia el otro. */
export const UNASSIGNED_ACCOUNT_NAME = 'Sin repartir'

/** Qué hacer con la plata de una cuenta nueva. `hold`/`drop` sólo existen para la PRIMERA cuenta (dejar
 *  el sobrante en «Sin repartir», o no declararlo); `from`/`new` sólo cuando ya hay cuentas activas
 *  (sale de otra cuenta, o es plata que la app no conocía). */
export type NewAccountSource = 'hold' | 'drop' | 'from' | 'new'

export interface FirstAccountSplit {
  /** Lo que la app cree que tenés y la primera cuenta no declara. Sólo es positivo con `kind: 'rest'`. */
  restCents: number
  /** `rest`: declaró menos que el saldo; `exact`: igual; `over`: declaró de más (es plata nueva, no
   *  hay nada que guardar aparte). */
  kind: 'rest' | 'exact' | 'over'
}

/** Cómo se reparte el saldo de la app entre lo que declara la primera cuenta y lo que sobra. */
export function firstAccountSplit(openingCents: number, balanceCents: number): FirstAccountSplit {
  const rest = balanceCents - openingCents
  if (rest > 0) return { restCents: rest, kind: 'rest' }
  return { restCents: 0, kind: rest === 0 ? 'exact' : 'over' }
}

/** M2 del QA: con una apertura NEGATIVA (un banco en descubierto), "los otros $X" de
 *  `firstAccountSplit` suma la apertura negativa — el resto sale más grande que TODO el saldo que el
 *  usuario tenía, y alarma aunque la matemática cierre (−apertura + resto = saldo). Esta nota, que se
 *  muestra junto a la pregunta, lo aclara. `null` con apertura ≥ 0: ahí "los otros $X" ya es intuitivo. */
export function firstAccountRestNote(openingCents: number): string | null {
  return openingCents < 0 ? 'Da más que tu saldo porque esta cuenta arranca en descubierto: sumado, cierra igual.' : null
}

const fromTo = (fromCents: number, toCents: number) => `de ${formatMoney(fromCents)} a ${formatMoney(toCents)}`

/** Lo que le pasa al saldo al crear la cuenta, y la frase que lo dice — se muestra en vivo debajo del
 *  importe, para que el saldo no cambie sin que se haya visto venir.
 *
 *  `balanceCents` es el saldo de hoy: el actual de la app si todavía no hay cuentas, la suma de las
 *  activas si ya hay. `fromName` sólo se usa con `source: 'from'`. */
export function newAccountEffect(input: {
  hasAccounts: boolean
  source: NewAccountSource
  openingCents: number
  balanceCents: number
  accountName: string
  fromName?: string
}): { totalAfterCents: number; note: string } {
  const { openingCents, balanceCents } = input

  if (!input.hasAccounts) {
    const split = firstAccountSplit(openingCents, balanceCents)
    if (split.kind === 'rest' && input.source === 'hold') {
      return {
        totalAfterCents: balanceCents,
        note: `Quedan en «${UNASSIGNED_ACCOUNT_NAME}» y tu saldo sigue en ${formatMoney(balanceCents)}. Después la renombrás, o movés esa plata a las cuentas que te falten cargar.`,
      }
    }
    if (split.kind === 'exact') {
      return { totalAfterCents: balanceCents, note: `Tu saldo no cambia: sigue en ${formatMoney(balanceCents)}.` }
    }
    const verb = split.kind === 'rest' ? 'pasa' : 'sube'
    const tail = split.kind === 'rest' ? ' Lo que no declares deja de contar.' : ''
    return { totalAfterCents: openingCents, note: `Tu saldo ${verb} ${fromTo(balanceCents, openingCents)}.${tail}` }
  }

  if (input.source === 'from') {
    return {
      totalAfterCents: balanceCents,
      note: `Tu saldo no cambia: la plata se mueve de ${input.fromName || 'esa cuenta'} a ${input.accountName || 'la cuenta nueva'}.`,
    }
  }

  if (openingCents === 0) return { totalAfterCents: balanceCents, note: 'Tu saldo no cambia.' }
  return {
    totalAfterCents: balanceCents + openingCents,
    note: `Tu saldo ${openingCents > 0 ? 'sube' : 'baja'} ${fromTo(balanceCents, balanceCents + openingCents)}.`,
  }
}

/** La cuenta de la que conviene sacar la apertura de una nueva: la activa con más plata, y ante un
 *  empate la predeterminada. Recién creada «Sin repartir» es casi siempre ella. `''` sin activas. */
export function defaultFundingAccountId(
  locations: readonly BalanceLocation[],
  derivedCents: ReadonlyMap<string, number>,
): string {
  const { accounts, defaultId } = accountsForGrid(locations)
  let best: BalanceLocation | undefined
  let bestCents = -Infinity
  for (const l of accounts) {
    const cents = derivedCents.get(l.id) ?? l.openingCents
    if (cents > bestCents || (cents === bestCents && l.id === defaultId)) {
      best = l
      bestCents = cents
    }
  }
  return best?.id ?? ''
}

/** No se puede mover más plata de la que la cuenta de origen tiene. A diferencia de un gasto, esto no
 *  es un descubierto que el usuario declara: es plata que se mueve de un lugar a otro, y la que no
 *  existe no se puede mover. Lo usan el alta con origen y "Transferir entre cuentas". `balanceCents`
 *  es el saldo que tiene el cliente; la base lo vuelve a comprobar contra el suyo. */
export function overdrawError(fromName: string, balanceCents: number, cents: number): string | null {
  if (cents <= balanceCents) return null
  const name = fromName || 'Esa cuenta'
  return balanceCents > 0
    ? `${name} tiene ${formatMoney(balanceCents)}: no podés sacar más que eso.`
    : `${name} no tiene saldo para sacar.`
}

/** Lo que vale el botón MÁX.: todo el saldo de la cuenta de origen. `null` si no hay nada que sacar
 *  (sin cuenta elegida, en cero o en descubierto) — ahí el botón no se ofrece. */
export function maxFromAccountCents(balanceCents: number | undefined): number | null {
  return balanceCents !== undefined && balanceCents > 0 ? balanceCents : null
}

/** El error del origen de la apertura (validación dentro del diálogo, patrón 5b), o `null`. Sólo
 *  aplica con `source: 'from'`. El importe inválido (`null`) lo marca el propio campo. */
export function fundingError(input: {
  source: NewAccountSource
  fromAccountId: string
  openingCents: number | null
  fromBalanceCents?: number
  fromName?: string
}): string | null {
  const { source, fromAccountId, openingCents, fromBalanceCents } = input
  if (source !== 'from') return null
  if (!fromAccountId) return 'Elegí de qué cuenta sale.'
  if (openingCents === null) return null
  if (openingCents <= 0) return 'Para sacarla de otra cuenta, el importe tiene que ser mayor a cero.'
  if (fromBalanceCents === undefined) return null
  return overdrawError(input.fromName ?? '', fromBalanceCents, openingCents)
}

/** Lo que se muestra bajo el selector "Sale de" (y junto al importe de una transferencia): cuánto
 *  tiene esa cuenta hoy y, si ya escribió un importe válido que entra, cuánto le queda. Un importe
 *  que no entra lo dice `overdrawError`. */
export function fundingBalanceNote(fromName: string, balanceCents: number, openingCents: number | null): string {
  const name = fromName || 'Esa cuenta'
  const tiene = `${name} tiene ${formatMoney(balanceCents)}`
  if (openingCents === null || openingCents <= 0 || openingCents > balanceCents) return `${tiene}.`
  return `${tiene} y le quedan ${formatMoney(balanceCents - openingCents)}.`
}

/** El aviso de una cuenta creada. `heldRestCents` es lo que quedó en «Sin repartir» (0 si nada);
 *  `fromName`, la cuenta de la que salió la apertura (`null` si no salió de ninguna). */
export function createAccountResultText(input: {
  name: string
  openingCents: number
  heldRestCents: number
  fromName: string | null
}): { title: string; detail: string } {
  const name = input.name || 'La cuenta'
  if (input.heldRestCents > 0) {
    return {
      title: 'Cuenta agregada',
      detail: `${name} · ${formatMoney(input.heldRestCents)} quedaron en «${UNASSIGNED_ACCOUNT_NAME}». Tu saldo no cambia.`,
    }
  }
  if (input.fromName !== null) {
    return { title: 'Cuenta agregada', detail: `${name} · ${formatMoney(input.openingCents)} desde ${input.fromName || 'otra cuenta'}` }
  }
  return { title: 'Cuenta agregada', detail: name }
}

// ---------------------------------------------------------------------------------------------
// Dejar de usar Cuentas
// ---------------------------------------------------------------------------------------------

/** El cuerpo de `StopUsingAccountsDialog`: cuántas cuentas (y sus transferencias entre sí) se van.
 *  El saldo no se pierde — `rpc_stop_using_accounts` lo conserva con un ajuste — así que acá no hay
 *  nada que advertir sobre plata, sólo sobre qué desaparece de `/cuentas`. */
export function stopUsingAccountsSummary(accountCount: number): string {
  return `Se van a borrar ${plural(accountCount, 'cuenta', 'cuentas')} y sus transferencias entre sí. Podés volver a activarlas cuando quieras.`
}
