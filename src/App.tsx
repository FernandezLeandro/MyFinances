import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AppLayout } from '@/app/AppLayout'
import { AuthLayout } from '@/app/AuthLayout'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireAuth, RedirectIfAuthed, RequireSessionNoProfile } from '@/features/auth/guards'
import { MutationLockOverlay } from '@/components/MutationLockOverlay'
import { Hoy } from '@/pages/Hoy'
import { Movimientos } from '@/pages/Movimientos'
import { Fijos } from '@/pages/Fijos'
import { Analisis } from '@/pages/Analisis'
import { Patrimonio } from '@/pages/Patrimonio'
import { Ajustes } from '@/pages/Ajustes'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Bienvenida } from '@/pages/auth/Bienvenida'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { ResetPassword } from '@/pages/auth/ResetPassword'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MutationLockOverlay />
        <Routes>
          <Route element={<AuthLayout />}>
            {/* Sin RedirectIfAuthed: Supabase abre una sesión temporal de recovery acá mismo. */}
            <Route path="restablecer" element={<ResetPassword />} />

            <Route
              element={
                <RedirectIfAuthed>
                  <Outlet />
                </RedirectIfAuthed>
              }
            >
              <Route path="login" element={<Login />} />
              <Route path="registro" element={<Register />} />
              <Route path="recuperar" element={<ForgotPassword />} />
            </Route>

            <Route path="bienvenida" element={<RequireSessionNoProfile><Bienvenida /></RequireSessionNoProfile>} />
          </Route>

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/hoy" replace />} />
            <Route path="hoy" element={<Hoy />} />
            <Route path="movimientos" element={<Movimientos />} />
            <Route path="fijos" element={<Fijos />} />
            <Route path="analisis" element={<Analisis />} />
            <Route path="patrimonio" element={<Patrimonio />} />
            <Route path="ajustes" element={<Ajustes />} />
            {/* Ruta vieja: por si alguien tiene el link guardado. */}
            <Route path="invitaciones" element={<Navigate to="/ajustes" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/hoy" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
