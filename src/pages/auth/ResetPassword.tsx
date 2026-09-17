import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { KeyRound } from 'lucide-react'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/FormError'
import { authUrlError, supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'

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

/** El link no sirve: venció, ya se usó, o nunca abrió sesión. Lo único útil es pedir otro. */
function LinkVencido() {
  return (
    <div>
      <div className="grid size-10 place-items-center rounded-[10px] bg-accent-soft">
        <KeyRound className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
      </div>
      <h1 className="mt-4 font-display text-2xl font-semibold">El link ya no sirve</h1>
      <p className="mt-3 text-[14px] text-fg-secondary">
        Los links de recuperación vencen y se usan una sola vez. Pedí uno nuevo y elegí la contraseña con ese.
      </p>
      <Link to="/recuperar" className="mt-6 inline-block text-[13px] font-semibold text-accent hover:opacity-80">
        Pedir un link nuevo
      </Link>
    </div>
  )
}

/**
 * Página a la que llega el link del mail de recuperación. Supabase abre una sesión temporal de
 * "recovery" al cargarla — por eso NO pasa por RedirectIfAuthed: si lo hiciera, esa sesión
 * la mandaría directo a /hoy antes de poder elegir la contraseña nueva.
 */
export function ResetPassword() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
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

  if (loading) return null // Mismo criterio que los guards: nada hasta saber si hay sesión.

  // Dos formas de que el link no sirva: GoTrue lo dijo explícito en el fragment (`authUrlError`), o
  // no dijo nada pero tampoco abrió sesión de recovery. En los dos casos mostrar el formulario sería
  // hacerle elegir una contraseña para que recién al enviarla se entere de que no se puede.
  if (authUrlError || !session) return <LinkVencido />

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Elegí una contraseña nueva</h1>
      </div>

      <Field label="Contraseña nueva" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          fieldSize="auth"
          autoComplete="new-password"
          invalid={!!errors.password}
          {...register('password')}
        />
      </Field>

      <Field label="Repetirla" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <Input
          id="confirmPassword"
          type="password"
          fieldSize="auth"
          autoComplete="new-password"
          invalid={!!errors.confirmPassword}
          {...register('confirmPassword')}
        />
      </Field>

      <FormError message={errors.root?.message} />

      <Button type="submit" size="auth" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? 'Guardando…' : 'Guardar y entrar'}
      </Button>
    </form>
  )
}
