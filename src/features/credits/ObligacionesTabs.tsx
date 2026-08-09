import { useLocation, useNavigate } from 'react-router'
import { Chip } from '@/components/ui/Chip'

/**
 * Fijos y Créditos son las dos únicas cosas que descuentan del saldo proyectado — emparejarlas acá
 * es más honesto que ponerlas como secciones sueltas, y evita sumar un 6º ítem a la nav principal
 * (el tab bar mobile ya viene ajustado: `<li className="flex-1">` sin `truncate`, y a 360px con 6
 * ítems "Movimientos" pasa a wrappear en dos líneas y desalinea toda la barra).
 */
export function ObligacionesTabs() {
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
    </div>
  )
}
