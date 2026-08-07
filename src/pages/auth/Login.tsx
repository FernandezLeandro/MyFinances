import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.string().email('Ingresá un email válido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormValues = z.infer<typeof schema>

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/hoy'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      setError('root', { message: 'Email o contraseña incorrectos.' })
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Entrar</h1>
        <p className="mt-1 text-[13px] text-chalk-faint">Tu saldo, tus movimientos.</p>
      </div>

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
      </Field>

      <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          invalid={!!errors.password}
          {...register('password')}
        />
      </Field>

      <FormError message={errors.root?.message} />

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </Button>

      <div className="flex items-center justify-between text-[13px] text-chalk-faint">
        <Link to="/recuperar" className="hover:text-chalk">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link to="/registro" className="hover:text-chalk">
          Crear cuenta
        </Link>
      </div>
    </form>
  )
}
