import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase'

const schema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

/**
 * Página a la que llega el link del mail de recuperación. Supabase abre una sesión temporal de
 * "recovery" al cargarla — por eso NO pasa por RedirectIfAuthed: si lo hiciera, esa sesión
 * la mandaría directo a /hoy antes de poder elegir la contraseña nueva.
 */
export function ResetPassword() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      setError('root', { message: 'No se pudo actualizar la contraseña. Pedí un nuevo link.' })
      return
    }
    navigate('/hoy', { replace: true })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Elegí una contraseña nueva</h1>
      </div>

      <Field label="Contraseña nueva" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
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

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? 'Guardando…' : 'Guardar y entrar'}
      </Button>
    </form>
  )
}
