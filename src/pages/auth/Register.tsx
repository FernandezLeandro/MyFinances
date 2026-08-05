import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

const schema = z
  .object({
    displayName: z.string().min(1, 'Contanos cómo te llamás').max(60),
    email: z.string().email('Ingresá un email válido'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
    inviteCode: z.string().min(1, 'Falta el código de invitación'),
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
    // Se valida antes de crear la cuenta: evita el alta si el código ya está claramente inválido.
    const { data: isValid, error: checkError } = await supabase.rpc('rpc_check_invite_code', {
      p_code: values.inviteCode,
    })
    if (checkError || !isValid) {
      setError('inviteCode', { message: 'Código inválido, vencido o ya usado' })
      return
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    })
    if (signUpError || !signUpData.session) {
      setError('root', { message: signUpError?.message ?? 'No se pudo crear la cuenta.' })
      return
    }

    // El código puede haberse agotado entre el check y este punto: rpc_redeem_invite_code
    // revalida y consume de forma atómica. Si falla acá, la cuenta ya existe pero sin perfil
    // ni categorías — se cierra la sesión para no dejarla en un estado a medias.
    const { error: redeemError } = await supabase.rpc('rpc_redeem_invite_code', {
      p_code: values.inviteCode,
      p_display_name: values.displayName,
    })
    if (redeemError) {
      await supabase.auth.signOut()
      setError('inviteCode', { message: 'El código se usó justo antes que vos. Pedí uno nuevo.' })
      return
    }

    navigate('/hoy', { replace: true })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Crear cuenta</h1>
        <p className="mt-1 text-[13px] text-chalk-faint">El alta es por invitación.</p>
      </div>

      <Field label="Nombre" htmlFor="displayName" error={errors.displayName?.message}>
        <Input id="displayName" autoComplete="name" invalid={!!errors.displayName} {...register('displayName')} />
      </Field>

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

      <Field label="Código de invitación" htmlFor="inviteCode" error={errors.inviteCode?.message}>
        <Input id="inviteCode" autoComplete="off" invalid={!!errors.inviteCode} {...register('inviteCode')} />
      </Field>

      {errors.root && (
        <p role="alert" className="text-[13px] text-coral">
          {errors.root.message}
        </p>
      )}

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
