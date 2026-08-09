import { lazy } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AppLayout } from '@/app/AppLayout'
import { AdminLayout } from '@/app/AdminLayout'
import { AuthLayout } from '@/app/AuthLayout'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireAuth, RequireAdmin, RedirectIfAuthed, RequireSessionNoProfile } from '@/features/auth/guards'
import { MutationLockOverlay } from '@/components/MutationLockOverlay'
import { ToastHost } from '@/components/ui/ToastHost'
import { Hoy } from '@/pages/Hoy'
import { Movimientos } from '@/pages/Movimientos'
import { Fijos } from '@/pages/Fijos'
import { Creditos } from '@/pages/Creditos'
import { Ajustes } from '@/pages/Ajustes'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Bienvenida } from '@/pages/auth/Bienvenida'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { ResetPassword } from '@/pages/auth/ResetPassword'

// `lazy`, no import estático: son las únicas rutas que arrastran recharts (Analisis, Patrimonio) o
// motion/react (Categorias, por el Reorder) — sacarlas del chunk inicial evita que /hoy pague el
// peso de gráficos y drag-and-drop que ni siquiera usa. El resto queda eager (ver Suspense abajo).
const Analisis = lazy(() => import('@/pages/Analisis').then((m) => ({ default: m.Analisis })))
const Patrimonio = lazy(() => import('@/pages/Patrimonio').then((m) => ({ default: m.Patrimonio })))
const Categorias = lazy(() => import('@/pages/admin/Categorias').then((m) => ({ default: m.Categorias })))
const Activos = lazy(() => import('@/pages/admin/Activos').then((m) => ({ default: m.Activos })))
const Invitaciones = lazy(() => import('@/pages/admin/Invitaciones').then((m) => ({ default: m.Invitaciones })))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MutationLockOverlay />
        <ToastHost />
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
            <Route path="creditos" element={<Creditos />} />
            <Route path="analisis" element={<Analisis />} />
            <Route path="patrimonio" element={<Patrimonio />} />
            <Route path="ajustes" element={<Ajustes />} />
            {/* Ruta vieja: por si alguien tiene el link guardado. */}
            <Route path="invitaciones" element={<Navigate to="/ajustes" replace />} />
          </Route>

          <Route
            path="admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="/admin/categorias" replace />} />
            <Route path="categorias" element={<Categorias />} />
            <Route path="activos" element={<Activos />} />
            <Route path="invitaciones" element={<Invitaciones />} />
          </Route>

          <Route path="*" element={<Navigate to="/hoy" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
