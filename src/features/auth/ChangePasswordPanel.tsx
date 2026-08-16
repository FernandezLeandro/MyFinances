import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/FormError'
import { showToast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresá tu contraseña actual'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

/**
 * Cambio de contraseña con la sesión abierta. A diferencia de `/restablecer` —donde el link del mail
 * ya prueba quién sos— acá hace falta la contraseña actual: si no, cualquiera que agarre el teléfono
 * desbloqueado se queda con la cuenta. Supabase no ofrece un "verificar contraseña" suelto, así que
 * la comprobación es un `signInWithPassword` con la sesión ya abierta: si la clave está mal devuelve
 * error sin tocar la sesión guardada, y si está bien sólo emite un `SIGNED_IN` con el mismo usuario
 * (`AuthProvider` únicamente limpia la caché en `SIGNED_OUT`, así que no se pierde nada).
 *
 * Vive en un panel y no en un `Dialog` porque lo montan dos páginas distintas: `/ajustes` para las
 * cuentas comunes y `/admin/cuenta` para el admin, que no tiene acceso a la nav financiera.
 */
export function ChangePasswordPanel() {
  const { user } = useAuth()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    const email = user?.email
    if (!email) {
      setError('root', { message: 'No pudimos identificar tu cuenta. Volvé a entrar y probá de nuevo.' })
      return
    }

    const reauth = await supabase.auth.signInWithPassword({ email, password: values.currentPassword })
    if (reauth.error) {
      setError('currentPassword', { message: 'La contraseña actual no es correcta' })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      // GoTrue rechaza repetir la contraseña vigente: el mensaje va al campo que hay que corregir,
      // no al bloque general del formulario.
      if (error.code === 'same_password') {
        setError('password', { message: 'La contraseña nueva tiene que ser distinta de la actual' })
        return
      }
      setError('root', { message: 'No se pudo cambiar la contraseña. Probá de nuevo.' })
      return
    }

    reset()
    // Único uso del tono 'ok' en la app: en un diálogo el éxito se ve porque se cierra, pero un panel
    // que se queda en pantalla con los campos vacíos no le dice nada al usuario.
    showToast('Contraseña actualizada', 'ok')
  }

  return (
    <Panel>
      <PanelHeader title="Contraseña" hint="Te pedimos la actual para confirmar que sos vos" />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 px-6 pb-6 sm:max-w-sm" noValidate>
        <Field label="Contraseña actual" htmlFor="currentPassword" error={errors.currentPassword?.message}>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            invalid={!!errors.currentPassword}
            {...register('currentPassword')}
          />
        </Field>

        <Field label="Contraseña nueva" htmlFor="newPassword" error={errors.password?.message}>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>

        <Field label="Repetirla" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
        </Field>

        <FormError message={errors.root?.message} />

        <Button type="submit" variant="outline" disabled={isSubmitting} className="self-start">
          {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </Panel>
  )
}
