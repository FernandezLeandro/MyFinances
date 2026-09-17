# Auth de Supabase: la config que no está en el repo

El esquema de la DB se versiona en `supabase/migrations/`, pero **la configuración de Auth no**: vive
sólo en el dashboard del proyecto. Si se recrea el proyecto, o si un link de mail empieza a apuntar a
cualquier lado, se revisa acá.

## El síntoma clásico: el mail de recuperación lleva a `localhost:3000`

`http://localhost:3000` es el valor **default** del Site URL de un proyecto Supabase recién creado.
No sale de esta app: `npm run dev` corre en **5173** (el default de Vite) y no hay una sola
referencia al puerto 3000 en el repo.

Lo que pasa es esto:

1. `src/pages/auth/ForgotPassword.tsx` pide el reset mandando un `redirectTo`
   (`https://<dominio>/restablecer`, armado por `src/lib/site-url.ts`).
2. GoTrue valida ese `redirect_to` contra la allow-list del proyecto.
3. **Si el origen no está en la allow-list, lo descarta en silencio** — no devuelve error, la app no
   tiene forma de enterarse — y arma el link con el Site URL del proyecto.

O sea: el dominio de producción no está en la allow-list y el Site URL sigue en el default. **No se
arregla desde el código.**

## Lo que hay que dejar configurado

### 1. Authentication → URL Configuration

| Campo | Valor |
|---|---|
| **Site URL** | El dominio de producción — `https://<dominio-produccion>` |
| **Redirect URLs** | La allow-list de abajo |

Redirect URLs (una por línea):

```
https://<dominio-produccion>/**
https://*.<proyecto>.pages.dev/**
http://localhost:5173/**
```

- El primero es producción.
- El segundo cubre los **previews de Cloudflare Pages**, que tienen un subdominio distinto por
  deploy. Sin el wildcard, pedir una recuperación desde un preview te manda al Site URL.
- El tercero es **dev local en 5173**, no 3000.

El Site URL no es decorativo: es el fallback que se usa cada vez que un `redirect_to` no matchea. Si
queda en el default, cualquier agujero en la allow-list se manifiesta como un link a `localhost:3000`.

### 2. Authentication → Email Templates → "Reset Password"

El `href` tiene que usar **`{{ .ConfirmationURL }}`**:

```html
<a href="{{ .ConfirmationURL }}">Elegir una contraseña nueva</a>
```

Si alguien lo cambió por `{{ .SiteURL }}`, el link **ignora el `redirect_to` siempre**, aunque la
allow-list esté perfecta. Mismo síntoma, otra causa — hay que descartarlo.

Aplica igual a la plantilla "Confirm signup" si algún día se prende la confirmación por mail:
`src/pages/auth/Register.tsx` hoy no manda `emailRedirectTo`, así que ese link saldría con el Site
URL sí o sí.

### 3. SMTP

Por defecto Supabase manda con su SMTP compartido, limitado a **~2-4 mails por hora en todo el
proyecto** y pensado sólo para desarrollo. Con usuarios reales se llega al límite enseguida y los
mails simplemente no salen — desde que se maneja el error en `ForgotPassword.tsx`, eso ahora se ve
en pantalla en vez de mostrar "Revisá tu email". Para producción, SMTP propio en
Authentication → Emails → SMTP Settings.

## `VITE_SITE_URL`

Del lado de la app, `src/lib/site-url.ts` arma el `redirectTo`. Si `VITE_SITE_URL` está definida gana
siempre; si no, cae a `window.location.origin`.

En Cloudflare Pages se setea **sólo en el entorno de Production**, no en Preview: así producción
siempre genera links al dominio canónico, y los previews siguen resolviendo a su propio origen (que
para eso está el wildcard en la allow-list). En dev local no hace falta definir nada.

## Cómo verificar que quedó bien

1. `npm run dev`, ir a `/recuperar` y pedir un link con una cuenta real.
2. El mail tiene que llevar a `http://localhost:5173/restablecer` (el link visible apunta a
   `<proyecto>.supabase.co/auth/v1/verify?...`; lo que importa es a dónde termina).
3. Cambiar la contraseña → entra a `/hoy`.
4. Volver a abrir el mismo link: ya se usó, tiene que aparecer "El link ya no sirve" con el botón
   para pedir otro, sin mostrar el formulario.
