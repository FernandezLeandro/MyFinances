import {
  Baby,
  Banknote,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Briefcase,
  Bus,
  Car,
  CreditCard,
  DollarSign,
  Dumbbell,
  Film,
  Gamepad2,
  Gift,
  GraduationCap,
  Hamburger,
  Handbag,
  HeartPulse,
  House,
  Laptop,
  Motorbike,
  PawPrint,
  PiggyBank,
  Pizza,
  Plane,
  Receipt,
  Shield,
  Shirt,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
  Volleyball,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Set curado de íconos de categoría, en el orden del editor (agrupados por tema: comida,
 * transporte, hogar, salud y familia, ocio y compras, plata, genérico). La key es el nombre kebab
 * de lucide y es lo que se guarda en `categories.icon` / `default_categories.icon`; la base acepta
 * sólo estas 35 (`categories_icon_set`, `20260926010001_categorias_icono_y_paleta.sql`). La
 * etiqueta es el `aria-label` y lo que matchea el buscador del editor.
 */
export const CATEGORY_ICONS = [
  { key: 'shopping-cart', label: 'Supermercado', Icon: ShoppingCart },
  { key: 'utensils', label: 'Comida', Icon: Utensils },
  { key: 'pizza', label: 'Pizza', Icon: Pizza },
  { key: 'hamburger', label: 'Comida rápida', Icon: Hamburger },
  { key: 'car', label: 'Auto', Icon: Car },
  { key: 'bus', label: 'Colectivo', Icon: Bus },
  { key: 'motorbike', label: 'Moto', Icon: Motorbike },
  { key: 'plane', label: 'Viajes', Icon: Plane },
  { key: 'house', label: 'Hogar', Icon: House },
  { key: 'zap', label: 'Luz y gas', Icon: Zap },
  { key: 'wifi', label: 'Internet', Icon: Wifi },
  { key: 'smartphone', label: 'Celular', Icon: Smartphone },
  { key: 'heart-pulse', label: 'Salud', Icon: HeartPulse },
  { key: 'graduation-cap', label: 'Educación', Icon: GraduationCap },
  { key: 'baby', label: 'Hijos', Icon: Baby },
  { key: 'paw-print', label: 'Mascotas', Icon: PawPrint },
  { key: 'film', label: 'Salidas', Icon: Film },
  { key: 'gamepad-2', label: 'Juegos', Icon: Gamepad2 },
  { key: 'dumbbell', label: 'Gimnasio', Icon: Dumbbell },
  { key: 'volleyball', label: 'Deporte', Icon: Volleyball },
  { key: 'gift', label: 'Regalos', Icon: Gift },
  { key: 'shirt', label: 'Ropa', Icon: Shirt },
  { key: 'handbag', label: 'Compras', Icon: Handbag },
  { key: 'credit-card', label: 'Tarjeta', Icon: CreditCard },
  { key: 'receipt', label: 'Impuestos', Icon: Receipt },
  { key: 'shield', label: 'Seguros', Icon: Shield },
  { key: 'briefcase', label: 'Sueldo', Icon: Briefcase },
  { key: 'laptop', label: 'Freelance', Icon: Laptop },
  { key: 'banknote', label: 'Efectivo', Icon: Banknote },
  { key: 'banknote-arrow-up', label: 'Cobro', Icon: BanknoteArrowUp },
  { key: 'banknote-arrow-down', label: 'Pago', Icon: BanknoteArrowDown },
  { key: 'dollar-sign', label: 'Dólares', Icon: DollarSign },
  { key: 'piggy-bank', label: 'Ahorro', Icon: PiggyBank },
  { key: 'trending-up', label: 'Inversiones', Icon: TrendingUp },
  { key: 'tag', label: 'General', Icon: Tag },
] as const satisfies readonly { key: string; label: string; Icon: LucideIcon }[]

export type CategoryIconKey = (typeof CATEGORY_ICONS)[number]['key']
export type CategoryIconDef = (typeof CATEGORY_ICONS)[number]

export const CATEGORY_ICON_KEYS = CATEGORY_ICONS.map((i) => i.key) as [CategoryIconKey, ...CategoryIconKey[]]

/** Ícono de una categoría nueva, y el que se usa si llega una key desconocida. */
export const DEFAULT_CATEGORY_ICON: CategoryIconKey = 'tag'

const byKey = new Map<string, CategoryIconDef>(CATEGORY_ICONS.map((i) => [i.key, i]))

export function categoryIcon(key: string | null | undefined): CategoryIconDef {
  return byKey.get(key ?? '') ?? byKey.get(DEFAULT_CATEGORY_ICON)!
}

/** Minúsculas y sin tildes — para buscar «educacion» y encontrar «Educación». */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function searchIcons(query: string): CategoryIconDef[] {
  const q = foldText(query)
  if (!q) return [...CATEGORY_ICONS]
  return CATEGORY_ICONS.filter((i) => foldText(i.label).includes(q) || i.key.includes(q))
}

/**
 * Primera fila del editor en mobile (los `n` primeros, el resto va detrás de un «+»). Si lo
 * elegido no está entre ellos, reemplaza al último — así lo elegido siempre se ve sin abrir el
 * sheet completo.
 */
export function firstRow<T>(all: readonly T[], selected: T, n: number): T[] {
  const row = all.slice(0, n)
  if (row.includes(selected) || !all.includes(selected)) return row
  return [...row.slice(0, n - 1), selected]
}
