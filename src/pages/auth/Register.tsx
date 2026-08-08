import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase'

const schema = z
  .object({
    email: z.string().email('Ingresá un email válido'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function Register() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    })
    if (error || !data.session) {
      setError('root', { message: error?.message ?? 'No se pudo crear la cuenta.' })
      return
    }

    // El nombre y el código de invitación se piden en /bienvenida, con la cuenta ya creada — es el
    // mismo paso para cualquier camino de alta, y evita dejar el registro a medias si algo
    // interrumpe el flujo justo después de crear la cuenta (antes, el redeem pasaba acá mismo).
    navigate('/bienvenida', { replace: true })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Crear cuenta</h1>
        <p className="mt-1 text-[13px] text-chalk-faint">El alta es por invitación — el código te lo pedimos en el próximo paso.</p>
      </div>

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
      </Field>

      <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          invalid={!!errors.password}
          {...register('password')}
        />
      </Field>

      <Field label="Repetir contraseña" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
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
        {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>

      <p className="text-center text-[13px] text-chalk-faint">
        ¿Ya tenés cuenta?{' '}
        <Link to="/login" className="text-chalk hover:underline">
          Entrá
        </Link>
      </p>
    </form>
  )
}
