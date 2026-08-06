/** Exporta filas a un .csv y dispara la descarga. Sin librería: es un formato trivial. */
export function downloadCsv(filename: string, rows: string[][]) {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const content = rows.map((row) => row.map(escape).join(',')).join('\r\n')

  // BOM al frente: sin esto Excel interpreta acentos y "ñ" como caracteres raros.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
