import { describe, expect, it } from 'vitest'
import { movementFieldLocks, originDeleteAction, originDeleteCopy, parseTransactionOrigin } from './origin'

describe('parseTransactionOrigin', () => {
  it('un objeto sin `kind` o que no es un objeto → plain, no rompe', () => {
    expect(parseTransactionOrigin(null)).toEqual({ kind: 'plain' })
    expect(parseTransactionOrigin(undefined)).toEqual({ kind: 'plain' })
    expect(parseTransactionOrigin('fixed_payment')).toEqual({ kind: 'plain' })
    expect(parseTransactionOrigin({})).toEqual({ kind: 'plain' })
  })

  it('un `kind` desconocido → plain, no explota si la base devuelve algo más nuevo que el front', () => {
    expect(parseTransactionOrigin({ kind: 'algo_que_todavia_no_existe' })).toEqual({ kind: 'plain' })
  })

  it('fixed_payment y fixed_saving: sólo el kind, sin más campos', () => {
    expect(parseTransactionOrigin({ kind: 'fixed_payment' })).toEqual({ kind: 'fixed_payment' })
    expect(parseTransactionOrigin({ kind: 'fixed_saving' })).toEqual({ kind: 'fixed_saving' })
  })

  it('card_payment: trae id, nombre, período, cantidad y total', () => {
    expect(
      parseTransactionOrigin({
        kind: 'card_payment',
        cardId: 'card-1',
        cardName: 'Visa',
        period: '2026-09-01',
        movementCount: 2,
        totalCents: 23000,
      }),
    ).toEqual({ kind: 'card_payment', cardId: 'card-1', cardName: 'Visa', period: '2026-09-01', movementCount: 2, totalCents: 23000 })
  })

  it('card_payment con campos faltantes: cae a valores por defecto, no `undefined`', () => {
    expect(parseTransactionOrigin({ kind: 'card_payment' })).toEqual({
      kind: 'card_payment',
      cardId: '',
      cardName: '',
      period: '',
      movementCount: 0,
      totalCents: 0,
    })
  })

  it('installment: trae el id y la descripción de la compra, y el período', () => {
    expect(
      parseTransactionOrigin({ kind: 'installment', purchaseId: 'purchase-1', purchaseDescription: 'Heladera', period: '2026-09-01' }),
    ).toEqual({ kind: 'installment', purchaseId: 'purchase-1', purchaseDescription: 'Heladera', period: '2026-09-01' })
  })

  it('los tres orígenes de deuda traen el id que hace falta para deshacerlos y el nombre de la persona', () => {
    expect(parseTransactionOrigin({ kind: 'receivable_expensed', receivableId: 'rec-1', personName: 'Juan' })).toEqual({
      kind: 'receivable_expensed',
      receivableId: 'rec-1',
      personName: 'Juan',
    })
    expect(parseTransactionOrigin({ kind: 'receivable_share', receivableId: 'rec-1', personName: 'Juan' })).toEqual({
      kind: 'receivable_share',
      receivableId: 'rec-1',
      personName: 'Juan',
    })
    expect(parseTransactionOrigin({ kind: 'receivable_payment', paymentId: 'pay-1', personName: 'Juan' })).toEqual({
      kind: 'receivable_payment',
      paymentId: 'pay-1',
      personName: 'Juan',
    })
  })

  it('adjustment y plain: sólo el kind', () => {
    expect(parseTransactionOrigin({ kind: 'adjustment' })).toEqual({ kind: 'adjustment' })
    expect(parseTransactionOrigin({ kind: 'plain' })).toEqual({ kind: 'plain' })
  })
})

describe('movementFieldLocks', () => {
  it('fixed_payment y fixed_saving: importe editable (lo sincroniza un trigger), tipo bloqueado', () => {
    expect(movementFieldLocks({ kind: 'fixed_payment' })).toMatchObject({ lockAmount: false, lockType: true })
    expect(movementFieldLocks({ kind: 'fixed_saving' })).toMatchObject({ lockAmount: false, lockType: true })
  })

  it('el resto de los orígenes vinculados bloquea importe Y tipo — MO-03/MO-07/MO-08', () => {
    const linked: Array<Parameters<typeof movementFieldLocks>[0]> = [
      { kind: 'card_payment', cardId: 'card-1', cardName: 'Visa', period: '2026-09-01', movementCount: 1, totalCents: 1000 },
      { kind: 'installment', purchaseId: 'purchase-1', purchaseDescription: 'Heladera', period: '2026-09-01' },
      { kind: 'receivable_expensed', receivableId: 'rec-1', personName: 'Juan' },
      { kind: 'receivable_share', receivableId: 'rec-1', personName: 'Juan' },
      { kind: 'receivable_payment', paymentId: 'pay-1', personName: 'Juan' },
      { kind: 'adjustment' },
    ]
    for (const origin of linked) {
      expect(movementFieldLocks(origin)).toMatchObject({ lockAmount: true, lockType: true })
    }
  })

  it('plain: nada bloqueado, sin nota', () => {
    expect(movementFieldLocks({ kind: 'plain' })).toEqual({ lockAmount: false, lockType: false, note: null })
  })

  it('la nota de un pago de tarjeta nombra la tarjeta', () => {
    const locks = movementFieldLocks({
      kind: 'card_payment',
      cardId: 'card-1',
      cardName: 'Visa',
      period: '2026-09-01',
      movementCount: 2,
      totalCents: 23000,
    })
    expect(locks.note).toContain('Visa')
  })
})

describe('originDeleteAction', () => {
  it('cada origen dispara la acción de deshacer de su pantalla', () => {
    expect(originDeleteAction({ kind: 'fixed_payment' })).toBe('unmarkFixedPayment')
    expect(originDeleteAction({ kind: 'fixed_saving' })).toBe('deleteFixedSaving')
    expect(
      originDeleteAction({ kind: 'card_payment', cardId: '', cardName: '', period: '', movementCount: 0, totalCents: 0 }),
    ).toBe('unmarkCardPayment')
    expect(originDeleteAction({ kind: 'installment', purchaseId: '', purchaseDescription: '', period: '' })).toBe('unmarkInstallment')
    expect(originDeleteAction({ kind: 'receivable_expensed', receivableId: '', personName: '' })).toBe('unexpenseReceivable')
    expect(originDeleteAction({ kind: 'receivable_payment', paymentId: '', personName: '' })).toBe('deleteReceivablePayment')
  })

  it('tu parte de un compartido, un ajuste y un movimiento suelto: delete directo', () => {
    expect(originDeleteAction({ kind: 'receivable_share', receivableId: '', personName: '' })).toBe('delete')
    expect(originDeleteAction({ kind: 'adjustment' })).toBe('delete')
    expect(originDeleteAction({ kind: 'plain' })).toBe('delete')
  })
})

describe('originDeleteCopy', () => {
  it('tarjeta: avisa que se deshace el período entero, no sólo este movimiento', () => {
    const copy = originDeleteCopy(
      { kind: 'card_payment', cardId: 'card-1', cardName: 'Visa', period: '2026-09-01', movementCount: 2, totalCents: 23000 },
      'Visa · Supermercado',
    )
    expect(copy.paragraphs.join(' ')).toContain('Visa')
    expect(copy.paragraphs.join(' ')).toContain('2 movimientos')
    expect(copy.paragraphs.join(' ')).toContain('no sólo este')
  })

  it('tarjeta con un solo movimiento: singular, no "1 movimientos"', () => {
    const copy = originDeleteCopy(
      { kind: 'card_payment', cardId: 'card-1', cardName: 'Visa', period: '2026-09-01', movementCount: 1, totalCents: 1000 },
      null,
    )
    expect(copy.paragraphs.join(' ')).toContain('1 movimiento ')
  })

  it('tu parte de un compartido: avisa que la deuda sigue en Me Deben', () => {
    const copy = originDeleteCopy({ kind: 'receivable_share', receivableId: 'rec-1', personName: 'Juan' }, 'Cena')
    expect(copy.paragraphs.join(' ')).toContain('Juan')
    expect(copy.paragraphs.join(' ')).toContain('Me Deben')
  })

  it('fixed_payment/fixed_saving/plain reusan el copy de confirmDeleteMovementCopy', () => {
    expect(originDeleteCopy({ kind: 'fixed_payment' }, 'Expensas').title).toBe('¿Quitar este pago?')
    expect(originDeleteCopy({ kind: 'fixed_saving' }, 'Guardado').title).toBe('¿Eliminar este guardado?')
    expect(originDeleteCopy({ kind: 'plain' }, 'Supermercado').title).toBe('¿Eliminar este movimiento?')
  })
})
