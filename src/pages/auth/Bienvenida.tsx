import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'

const schema = z.object({
  displayName: z.string().min(1, 'Contanos cómo te llamás').max(60),
  inviteCode: z.string().min(1, 'Falta el código de invitación'),
})

type FormValues = z.infer<typeof schema>

/**
 * A donde cae cualquier sesión sin perfil todavía: el alta normal desde /registro (ahora en dos
 * pasos), o una cuenta que quedó a mitad de camino por cualquier otro motivo. Sin código válido no
 * hay perfil, y sin perfil `RequireAuth` no deja pasar — es la mitad del cierre del agujero de
 * invitación; la otra mitad son las policies en la base, que son las que de verdad protegen.
 */
export function Bienvenida() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    // Mismo pre-check que ya usaba /registro: da feedback antes de gastar el intento de redeem.
    const { data: isValid, error: checkError } = await supabase.rpc('rpc_check_invite_code', {
      p_code: values.inviteCode,
    })
    if (checkError || !isValid) {
      setError('inviteCode', { message: 'Código inválido, vencido o ya usado' })
      return
    }

    const { error: redeemError } = await supabase.rpc('rpc_redeem_invite_code', {
      p_code: values.inviteCode,
      p_display_name: values.displayName,
    })
    if (redeemError) {
      setError('inviteCode', { message: 'El código se usó justo antes que vos. Pedí uno nuevo.' })
      return
    }

    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    navigate('/hoy', { replace: true })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Un último paso</h1>
        <p className="mt-1 text-[13px] text-chalk-faint">Contanos quién sos y con qué código entrás.</p>
      </div>

      <Field label="Nombre" htmlFor="displayName" error={errors.displayName?.message}>
        <Input id="displayName" autoComplete="name" invalid={!!errors.displayName} {...register('displayName')} />
      </Field>

      <Field label="Código de invitación" htmlFor="inviteCode" error={errors.inviteCode?.message}>
        <Input id="inviteCode" autoComplete="off" invalid={!!errors.inviteCode} {...register('inviteCode')} />
      </Field>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </Button>

      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="text-center text-[13px] text-chalk-faint hover:text-chalk"
      >
        Cerrar sesión
      </button>
    </form>
  )
}
