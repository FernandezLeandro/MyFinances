import type { ReactNode } from 'react'

/** Cómo se lee el efecto de una acción sobre el saldo: neutro/condicional, sin impacto o informado
 *  (`accent`), baja el total (`amber`) o destructivo (`red`). */
export type HelpEffectTone = 'neutral' | 'accent' | 'amber' | 'red'

export interface HelpStep {
  title: string
  /** `ReactNode` y no `string` para poder resaltar el nombre de una acción con `<strong>`. */
  body: ReactNode
}

export interface HelpLegendItem {
  /** El arranque en negrita: "El total.". */
  lead: string
  body: string
}

export interface HelpAction {
  /** Un id estable para atar la fila a la acción real (el test lo cruza con el menú). */
  id: string
  name: string
  /** Se pinta en rojo: sólo la acción que borra datos. */
  destructive?: boolean
  effect: { label: string; tone: HelpEffectTone }
  description: string
}

export interface HelpFaqItem {
  question: string
  answer: string
}
