import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Link } from 'react-router'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase'
import { siteUrl } from '@/lib/site-url'

const schema = z.object({ email: z.string().email('Ingresá un email válido') })
type FormValues = z.infer<typeof schema>

export function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: siteUrl('/restablecer'),
    })

    // Mirar el error NO filtra qué emails están registrados: `resetPasswordForEmail` devuelve lo
    // mismo exista o no la cuenta. Lo que llega acá es que el mail no se pudo mandar —rate limit
    // del SMTP, servidor caído— y antes eso se mostraba igual como éxito: el usuario esperaba un
    // mail que nunca iba a llegar.
    if (error) {
      setError('root', { message: 'No se pudo enviar el mail. Probá de nuevo en unos minutos.' })
      return
    }

    // Mismo mensaje exista o no la cuenta: no confirmamos qué emails están registrados.
    setSent(true)
  }

  if (sent) {
    return (
      <div>
        <div className="grid size-10 place-items-center rounded-[10px] bg-accent-soft">
          <Mail className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold">Revisá tu email</h1>
        <p className="mt-3 text-[14px] text-fg-secondary">
          Si esa dirección tiene una cuenta, te llegó un link para elegir una contraseña nueva.
        </p>
        <Link to="/login" className="mt-6 inline-block text-[13px] font-semibold text-accent hover:opacity-80">
          Volver a entrar
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Recuperar contraseña</h1>
        <p className="mt-1 text-[13px] text-fg-muted">Te mandamos un link para elegir una nueva.</p>
      </div>

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" fieldSize="auth" autoComplete="email" invalid={!!errors.email} {...register('email')} />
      </Field>

      <FormError message={errors.root?.message} />

      <Button type="submit" size="auth" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? 'Enviando…' : 'Enviar link'}
      </Button>

      <p className="text-center text-[13px]">
        <Link to="/login" className="font-semibold text-accent hover:opacity-80">
          Volver a entrar
        </Link>
      </p>
    </form>
  )
}
