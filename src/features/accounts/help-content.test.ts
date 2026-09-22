import { describe, expect, it } from 'vitest'
import { accountMenuEntries, type AccountMenuActionId } from '@/features/accounts/aggregate'
import { ACCOUNTS_HELP } from '@/features/accounts/help-content'

// La ayuda de Cuentas es texto escrito a mano sobre un menú que cambia. Sin este test, sumar, sacar o
// renombrar una acción de `accountMenuEntries()` deja a la ayuda explicando algo que ya no existe —
// y la primera persona en notarlo es alguien buscando «Archivar» que no la encuentra.

/** Todo lo que el menú puede llegar a ofrecer, en cualquier superficie y estado. */
function menuActions() {
  const seen = new Map<AccountMenuActionId, { label: string; shownAlways: boolean }>()
  const combos: Parameters<typeof accountMenuEntries>[0][] = []
  for (const surface of ['popover', 'sheet'] as const) {
    for (const isDefault of [true, false]) {
      for (const activeCount of [1, 2, 3]) combos.push({ surface, isDefault, activeCount })
    }
  }
  for (const combo of combos) {
    const inThisCombo = new Set<AccountMenuActionId>()
    for (const entry of accountMenuEntries(combo)) {
      if (entry.kind !== 'action') continue
      inThisCombo.add(entry.id)
      if (!seen.has(entry.id)) seen.set(entry.id, { label: entry.label, shownAlways: true })
    }
    for (const [id, info] of seen) if (!inThisCombo.has(id)) info.shownAlways = false
  }
  return seen
}

describe('ayuda de Cuentas', () => {
  const documented = new Map(ACCOUNTS_HELP.actions.map((a) => [a.id, a]))

  it('documenta cada acción que el menú puede mostrar', () => {
    for (const id of menuActions().keys()) expect(documented.has(id), `falta «${id}» en la ayuda`).toBe(true)
  })

  it('no repite acciones', () => {
    expect(documented.size).toBe(ACCOUNTS_HELP.actions.length)
  })

  it('llama a cada acción igual que el menú', () => {
    for (const [id, { label }] of menuActions()) {
      const action = documented.get(id)!
      // «Transferir» es la excepción a propósito: el botón del total dice «Transferir entre cuentas» y
      // el menú «Transferir desde acá». La fila lleva el nombre del botón y tiene que nombrar el del menú.
      if (id === 'transfer') expect(action.description).toContain(`«${label}»`)
      else expect(action.name).toBe(label)
    }
  })

  it('sólo documenta de más lo que sale de la tarjeta del total', () => {
    const inMenu = menuActions()
    const extras = ACCOUNTS_HELP.actions.map((a) => a.id).filter((id) => !inMenu.has(id as AccountMenuActionId))
    expect(extras).toEqual(['create'])
  })

  it('la nota avisa de las acciones que no siempre aparecen', () => {
    // «Reajustar saldo» sólo falta del popover porque es el botón de la tarjeta: no cuenta como condicional.
    const conditional = [...menuActions()]
      .filter(([id, info]) => !info.shownAlways && id !== 'adjust')
      .map(([id]) => id)
      .sort()
    // Si el menú suma otra acción condicional, hay que sumarla también a `actionsFootnote`.
    expect(conditional).toEqual(['archive', 'setDefault', 'transfer'])
  })
})
