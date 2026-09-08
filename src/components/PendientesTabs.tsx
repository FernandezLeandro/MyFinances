import { useLocation, useNavigate } from 'react-router'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'

const ROUTES = [
  { value: '/fijos', label: 'Fijos' },
  { value: '/mis-deudas', label: 'Mis Deudas' },
  { value: '/me-deben', label: 'Me Deben' },
] as const

type PendienteRoute = (typeof ROUTES)[number]['value']

/**
 * Fijos, Mis Deudas y Me Deben comparten header: son las tres pantallas de plata que todavía no se
 * resolvió. Emparejarlas acá es más honesto que ponerlas como secciones sueltas, y sigue evitando
 * sumar un 4º ítem al tab bar mobile (`<li className="flex-1">` sin `truncate`: a 360px con 6
 * ítems "Movimientos" pasa a wrappear en dos líneas y desalinea toda la barra).
 *
 * Antes se llamaba ObligacionesTabs, cuando eran sólo Fijos y Créditos (hoy Mis Deudas) — "las dos
 * únicas cosas que descuentan del saldo proyectado". Me Deben rompe las dos mitades de esa frase:
 * no es una obligación (es plata a favor) y NO toca el saldo proyectado, ni sumando ni restando
 * (ver el comentario de la migración `receivables_deudas_a_favor`). Lo que las une es más flojo y
 * más cierto: las tres responden "¿qué queda pendiente?".
 */
export function PendientesTabs() {
  const navigate = useNavigate()
  const location = useLocation()

  const current = (ROUTES.find((r) => r.value === location.pathname)?.value ?? '/fijos') as PendienteRoute

  return (
    <SegmentedToggle
      value={current}
      options={ROUTES}
      onChange={(route) => navigate(route)}
      variant="pill"
      className="w-max"
    />
  )
}
