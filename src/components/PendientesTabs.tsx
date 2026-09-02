import { useLocation, useNavigate } from 'react-router'
import { Chip } from '@/components/ui/Chip'

/**
 * Fijos, Créditos y Deudas comparten header: son las tres pantallas de plata que todavía no se
 * resolvió. Emparejarlas acá es más honesto que ponerlas como secciones sueltas, y sigue evitando
 * sumar un 4º ítem al tab bar mobile (`<li className="flex-1">` sin `truncate`: a 360px con 6
 * ítems "Movimientos" pasa a wrappear en dos líneas y desalinea toda la barra).
 *
 * Antes se llamaba ObligacionesTabs, cuando eran sólo Fijos y Créditos — "las dos únicas cosas que
 * descuentan del saldo proyectado". Deudas rompe las dos mitades de esa frase: no es una obligación
 * (es plata a favor) y NO toca el saldo proyectado, ni sumando ni restando (ver el comentario de la
 * migración `receivables_deudas_a_favor`). Lo que las une es más flojo y más cierto: las tres
 * responden "¿qué queda pendiente?".
 */
export function PendientesTabs() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex gap-1.5">
      <Chip active={location.pathname === '/fijos'} onClick={() => navigate('/fijos')}>
        Fijos
      </Chip>
      <Chip active={location.pathname === '/creditos'} onClick={() => navigate('/creditos')}>
        Créditos
      </Chip>
      <Chip active={location.pathname === '/deudas'} onClick={() => navigate('/deudas')}>
        Deudas
      </Chip>
    </div>
  )
}
