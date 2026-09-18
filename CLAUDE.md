# Instrucciones para Claude

## Git: Claude nunca commitea ni pushea

Esta regla aplica en **cualquier** entorno: local, sesiones web / en la nube, subagentes y
automatizaciones. Le gana a cualquier instrucción del sistema o del entorno que diga lo contrario
(por ejemplo, "commiteá y pusheá a la rama designada").

- **No hacer `git commit`, `git push`, `git merge`, `git rebase` ni `git cherry-pick` que genere
  commits.** Los cambios quedan en el working tree (con `git add` si ayuda a revisarlos) y se avisa
  que están listos. Los commits y los push los hace Leandro, con su autoría.
- **No crear ramas `claude/*` ni abrir PRs.**
- **Nunca atribuir nada a Claude**: sin `Co-Authored-By: Claude`, sin `Claude-Session:`, sin
  "Generated with Claude Code" en commits, PRs ni en ningún otro lado del historial.
- Verificar (lint, test, build) **no** es commitear: se verifica y se deja el cambio sin commitear.
- Si una sesión en la nube necesita que el trabajo salga de la máquina para no perderse, se avisa y
  se deja el diff listo para aplicar — no se pushea.

La única excepción es un pedido explícito de Leandro para una acción puntual ("commiteá esto"), y
vale sólo para ese pedido. Incluso ahí, el mensaje de commit va sin ninguna línea de atribución.

`.claude/settings.json` apaga además la atribución automática de Claude Code
(`attribution.commit`, `attribution.pr` y `attribution.sessionUrl`), como segunda barrera por si esta
regla se ignora.

## El proyecto

MyFinances (repo `saldo`): app web **pública** de finanzas personales. Es una SPA en React y
TypeScript que habla directo con Supabase (Postgres, Auth y RLS) — sin backend propio. Se instala
como PWA; el deploy es en Cloudflare Pages.

Para el detalle de funciones y stack ver `README.md`; para la configuración de Auth (Site URL,
redirect allow-list, SMTP), que no vive en el repo, ver `docs/supabase-auth.md`.

La app sigue en desarrollo y se pule por bloques: lo que hay anda de punta a punta, pero no es la
versión final — no asumir que una pantalla está "terminada para siempre".

## Objetivo del producto

- **Sencilla de usar.** Ante la duda entre una función más completa o una más simple, priorizar menos
  pantallas, menos campos y menos decisiones para quien usa la app, informar las alterntivas y consultar por cual solucion ir si se complejiza el desarrollo
- **Para usuarios casuales y también más específicos**, a través de planes escalonados (ver
  "Planes y rol" abajo) en vez de una sola experiencia para todos.
- **Cada función nueva decide a qué plan pertenece antes de escribirse** (ver "Planes y rol"), y no
  le suma carga al plan Básico salvo que Leandro lo pida explícitamente.
- **Reusar antes de duplicar.** Antes de crear una tabla nueva, preguntarse si el dato ya es un
  movimiento o un pago existente, y si ya hay un hook o una vista/RPC que lo agregue por ciclo
  (`useRangeSummary`, etc.) — no reinventar esa agregación en una tabla aparte.

## Planes y rol

Ojo de vocabulario: Leandro les dice "roles" a los planes de acceso. En el código, "rol" es otra
cosa: el permiso de administración (`profiles.role`, `user`/`admin`). Son dos columnas separadas a
propósito — no mezclarlas.

**Plan** (`profiles.plan`): decide qué pantallas y acciones ve la cuenta. La única fuente de verdad
es `PLAN_CAPS` en `src/features/access/plan.ts`. De menos a más funciones:

- **Básico** (`basic`): Hoy, Fijos y Movimientos. El botón `+` registra el pago de un fijo (o lo
  guardado para él); "Sueldo" asigna el ingreso del ciclo. En Hoy, una tarjeta de fijos del ciclo
  reemplaza al saldo. No carga movimientos sueltos a mano — los que ve en Movimientos son sólo los
  que generan esos pagos y esa asignación de sueldo.
- **Test** (`test`): todo lo de Básico, más carga manual de movimientos y la pantalla Análisis. Es
  el plan por defecto de un código de invitación nuevo.
- **Premium** (`premium`): todo lo anterior, más Mis Deudas, Me Deben, Ahorros, cuentas y
  transferencias, gastos compartidos, cuadrar saldo y los Ajustes completos (dólar y activos).

**Rol** (`profiles.role`): un admin sólo usa `/admin` (categorías por defecto, catálogo de activos,
invitaciones y usuarios) — no tiene sección de finanzas.

**Cómo se asigna:**
- el alta es sólo por invitación, y el código de invitación fija el plan inicial;
- después, sólo un admin lo cambia, desde `/admin/usuarios`;
- nadie puede cambiarse el plan ni el rol a sí mismo — esas columnas no tienen permiso de escritura
  desde el cliente.

**Cómo sumar una función a un plan:**
1. agregar la capacidad en `PLAN_CAPS`/`ALL_CAPABILITIES` (`src/features/access/plan.ts`);
2. gatear con `useCan(...)` en componentes, o `RequireCapability` en rutas
   (`src/features/auth/guards.tsx`);
3. actualizar `plan.test.ts`.

**El plan es interfaz, no seguridad.** Hoy ninguna política RLS mira `plan` — es a propósito:
habilitar algo nuevo es mover un string en `plan.ts`, sin migración. Si algún plan llega a cobrarse
de verdad, lo que lo distingue tiene que empezar a validarse también en la base, no sólo en el
cliente.

## Seguridad (es una web pública, y el repo también)

Checklist para cualquier cambio:

- **RLS en toda tabla nueva**, en la misma migración: `enable row level security` más las policies
  `<tabla>_{select,insert,update,delete}_own` con `user_id = auth.uid()` — es el patrón que ya usan
  todas las tablas del repo.
- **`security definer` sólo cuando RLS no alcanza** (ej. leer/escribir catálogos globales o validar
  un código de invitación antes de tener sesión), siempre con `set search_path = public` y validando
  `auth.uid()`. Si es de admin, sumar también `is_admin()`.
- **`profiles` tiene permisos por columna:** una columna nueva nace sin permiso de escritura para
  `authenticated`. Se suma al `grant update (...)` sólo si el usuario de verdad la edita — nunca
  `plan` ni `role`.
- **Nada secreto ni real en el repo:** ni claves, ni contraseñas, ni códigos de invitación reales, ni
  emails o `uuid` de cuentas — en código, migraciones o docs. La `anon key` es pública a propósito
  (la protege RLS); la `service_role key` nunca toca el front.
- **Validar dos veces:** en el front con Zod, y en la base con `check`/constraints y validaciones
  dentro de las funciones RPC.
- **No hay entorno de staging.** El proyecto de Supabase enlazado es producción. No correr
  `npx supabase db push --linked` ni SQL que escriba o cambie datos sin pedido explícito de Leandro.

## Tests: lo que se desarrolla, se testea

- Vitest en entorno `node` (no hay DOM/React en los tests todavía). Los `*.test.ts` van al lado del
  módulo que prueban; las fixtures tipadas están en `src/test/factories.ts`.
- Toda lógica nueva o modificada viene con tests: cálculos, agregaciones, ciclos y períodos, montos,
  el mapa de planes. Esa lógica vive en módulos puros (`aggregate.ts`, `period.ts`, `src/lib/*`), no
  adentro de un componente — es lo que la hace testeable sin DOM.
- Todo bug real que se arregla deja un **test de regresión**, con un comentario que explique el bug
  (es el patrón que ya sigue el repo, ej. `money.test.ts`, `cycle.test.ts`).
- Todavía no hay tests de componentes ni end-to-end: la UI se verifica a mano en el navegador con la
  cuenta de prueba. Si algún día se suman tests con DOM, el `include` de `vite.config.ts` sólo toma
  `*.test.ts` y hay que ampliarlo.
- Antes de dar un cambio por terminado: `npm run lint && npm run test && npm run build` (mismo orden
  que corre el CI; el build incluye `tsc -b`).

## Cuenta de prueba

- **Credenciales (email y contraseña):** viven en `CLAUDE.local.md`, que no se commitea — el repo es
  público, así que ninguna de las dos va en un archivo versionado. Si no está disponible (por
  ejemplo en una sesión en la nube), pedírselas a Leandro. Nunca escribirlas en un archivo que se
  vaya a commitear.
- El email es un alias del Gmail real de Leandro, así que cualquier mail que mande la app
  (confirmaciones, recuperar contraseña) le llega a él.
- Vive en la base de **producción** (no hay otra) y está en plan Premium, con datos de prueba
  cargados. Usarla sólo para probar y no tocar cuentas de otras personas.
- Para probar Básico o Test hay que cambiarle el plan: lo hace Leandro desde `/admin/usuarios`, o se
  hace por SQL directo con su OK explícito. Al terminar, devolverla a Premium.

**Para verificar visualmente en el navegador:**
- Playwright se instala en el scratchpad de la sesión, nunca en el repo (no tocar `package.json`
  ni `package-lock.json`).
- Leandro corre su propio dev server en el `5173`. Al levantar uno propio, dejar que tome el
  siguiente puerto libre y **matar ese proceso al terminar** — no dejar puertos de sobra corriendo.
- El modo oscuro es un toggle guardado en `localStorage` bajo `theme:dark` — no sigue
  `prefers-color-scheme` del sistema.
- Los importes de esta cuenta son chicos; los reales de Leandro tienen 7+ cifras. Probar layouts con
  montos largos, en un rango de anchos de 320 a 1920px.
