import { ChangePasswordPanel } from '@/features/auth/ChangePasswordPanel'

/**
 * Lo único que el admin necesita de "su cuenta": cambiar la contraseña. Existe como página aparte
 * porque `/ajustes` es territorio de las cuentas comunes — `RequireAuth` manda al admin a `/admin`
 * apenas ve el rol, así que sin esta ruta no tendría ningún lugar donde cambiarla.
 */
export function Cuenta() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Administración</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Cuenta</h1>
      </header>

      <ChangePasswordPanel />
    </div>
  )
}
