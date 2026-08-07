/** El error de nivel-formulario de un `useForm` (`errors.root`) — mismo bloque textual repetido en
 *  Login/Register/ResetPassword. No es para errores de mutación: esos van al toast global. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-[13px] text-coral">
      {message}
    </p>
  )
}
