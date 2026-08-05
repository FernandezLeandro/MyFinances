/**
 * Datos de ejemplo — SÓLO para maquetar el Bloque 0.
 *
 * Este archivo se borra entero en el Bloque 2, cuando entran las queries reales contra Supabase.
 * Nada fuera de `src/pages/` debería importarlo.
 */

export type TxType = 'income' | 'expense'

export interface MockCategory {
  id: string
  name: string
  color: string
  kind: TxType
}

export interface MockTransaction {
  id: string
  type: TxType
  cents: number
  occurredOn: string // ISO date
  categoryId: string
  description: string
}

export interface MockFixedExpense {
  id: string
  name: string
  cents: number
  categoryId: string
  dueDay: number
  paid: boolean
}

export const mockCategories: MockCategory[] = [
  { id: 'sueldo', name: 'Sueldo', color: 'var(--color-acid)', kind: 'income' },
  { id: 'freelance', name: 'Freelance', color: 'var(--color-cat-moss)', kind: 'income' },
  { id: 'super', name: 'Supermercado', color: 'var(--color-cat-teal)', kind: 'expense' },
  { id: 'transporte', name: 'Transporte', color: 'var(--color-cat-sky)', kind: 'expense' },
  { id: 'salidas', name: 'Salidas', color: 'var(--color-cat-rose)', kind: 'expense' },
  { id: 'servicios', name: 'Servicios', color: 'var(--color-cat-amber)', kind: 'expense' },
  { id: 'salud', name: 'Salud', color: 'var(--color-cat-violet)', kind: 'expense' },
  { id: 'hogar', name: 'Hogar', color: 'var(--color-cat-sand)', kind: 'expense' },
]

export const mockTransactions: MockTransaction[] = [
  { id: 't01', type: 'income', cents: 1_480_000_00, occurredOn: '2026-08-01', categoryId: 'sueldo', description: 'Sueldo agosto' },
  { id: 't02', type: 'expense', cents: 62_400_00, occurredOn: '2026-08-01', categoryId: 'super', description: 'Compra grande del mes' },
  { id: 't03', type: 'expense', cents: 8_900_00, occurredOn: '2026-08-02', categoryId: 'transporte', description: 'Carga SUBE' },
  { id: 't04', type: 'expense', cents: 24_300_00, occurredOn: '2026-08-02', categoryId: 'salidas', description: 'Cena con Flor' },
  { id: 't05', type: 'expense', cents: 15_750_00, occurredOn: '2026-08-03', categoryId: 'hogar', description: 'Lamparitas y pilas' },
  { id: 't06', type: 'income', cents: 210_000_00, occurredOn: '2026-08-03', categoryId: 'freelance', description: 'Landing para el estudio' },
  { id: 't07', type: 'expense', cents: 12_200_00, occurredOn: '2026-08-04', categoryId: 'super', description: 'Verdulería' },
  { id: 't08', type: 'expense', cents: 34_000_00, occurredOn: '2026-08-04', categoryId: 'salud', description: 'Farmacia' },
  { id: 't09', type: 'expense', cents: 6_500_00, occurredOn: '2026-08-05', categoryId: 'transporte', description: 'Nafta' },
  { id: 't10', type: 'expense', cents: 19_800_00, occurredOn: '2026-08-05', categoryId: 'salidas', description: 'Café y librería' },
]

export const mockFixedExpenses: MockFixedExpense[] = [
  { id: 'f1', name: 'Alquiler', cents: 480_000_00, categoryId: 'hogar', dueDay: 5, paid: true },
  { id: 'f2', name: 'Luz y gas', cents: 38_500_00, categoryId: 'servicios', dueDay: 12, paid: false },
  { id: 'f3', name: 'Internet', cents: 29_900_00, categoryId: 'servicios', dueDay: 15, paid: false },
  { id: 'f4', name: 'Netflix', cents: 9_400_00, categoryId: 'salidas', dueDay: 20, paid: false },
  { id: 'f5', name: 'Prepaga', cents: 118_000_00, categoryId: 'salud', dueDay: 28, paid: false },
]

export const categoryById = new Map(mockCategories.map((c) => [c.id, c]))

/** Saldo actual: todo lo que entró menos todo lo que salió. */
export const currentBalance = mockTransactions.reduce(
  (acc, t) => acc + (t.type === 'income' ? t.cents : -t.cents),
  0,
)

export const monthIncome = mockTransactions
  .filter((t) => t.type === 'income')
  .reduce((acc, t) => acc + t.cents, 0)

export const monthExpense = mockTransactions
  .filter((t) => t.type === 'expense')
  .reduce((acc, t) => acc + t.cents, 0)

export const pendingFixed = mockFixedExpenses.filter((f) => !f.paid)

/** La métrica que justifica la app: con cuánto termina el mes una vez pagados los fijos que faltan. */
export const pendingFixedTotal = pendingFixed.reduce((acc, f) => acc + f.cents, 0)
export const projectedBalance = currentBalance - pendingFixedTotal
