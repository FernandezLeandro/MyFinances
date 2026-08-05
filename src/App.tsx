import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppLayout } from '@/app/AppLayout'
import { Hoy } from '@/pages/Hoy'
import { Movimientos } from '@/pages/Movimientos'
import { Fijos } from '@/pages/Fijos'
import { Analisis } from '@/pages/Analisis'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/hoy" replace />} />
          <Route path="hoy" element={<Hoy />} />
          <Route path="movimientos" element={<Movimientos />} />
          <Route path="fijos" element={<Fijos />} />
          <Route path="analisis" element={<Analisis />} />
          <Route path="*" element={<Navigate to="/hoy" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
