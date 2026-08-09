/** `'(3/12)'`, o `''` si es de una sola cuota — la ausencia del marcador ya comunica "esto no
 *  vuelve el mes que viene". Se repite en la fila de compra, el diálogo de pago y el detalle del
 *  período, de ahí que valga la pena una función en vez de repetir el template string. */
export function etiquetaCuota(nro: number, total: number): string {
  return total > 1 ? `(${nro}/${total})` : ''
}
