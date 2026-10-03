# Instrucciones para MyFinances

## El proyecto

MyFinances (repo `saldo`): app web **pública** de finanzas personales. SPA en React y TypeScript que habla directo con Supabase (Postgres, Auth y RLS), sin backend propio. PWA, deploy en Cloudflare Pages. Sigue en desarrollo y se pule por bloques: ninguna pantalla es versión final.

Otros docs, leer sólo cuando hagan falta: `README.md` (funciones, stack, convenciones — versión para personas; lo que Claude necesita ya está acá y en `.claude/rules/`), `docs/supabase-auth.md` (Site URL, redirects, SMTP), `docs/qa/README.md` (ver Tests).

Reglas por área en `.claude/rules/`, se cargan solas al tocar esos archivos: `ui.md` (shell, diálogos, estilos) y `supabase.md` (migraciones, RLS, producción).

## Objetivo del producto

- **Sencilla de usar.** Ante la duda entre más completo o más simple: menos pantallas, campos y decisiones. Si una solución se complica, informar alternativas y consultar.
- **Planes escalonados** para usuarios casuales y más específicos. Cada función nueva decide a qué plan pertenece antes de escribirse, y no suma carga al plan Básico salvo pedido explícito de Leandro.
- **Reusar antes de duplicar.** Antes de una tabla nueva, preguntarse si el dato ya es un movimiento o pago existente, y si ya hay hook o vista/RPC que agregue por ciclo (`useRangeSummary`, `summarizeFixedExpenses`). Motivo: el «sueldo» nació como tabla aparte y tuvo que revertirse — plata que se movió de verdad es un `transactions`; sólo un estado (como un guardado) justifica tabla propia.

## Planes y rol

- **Plan** (`profiles.plan`), única fuente de verdad `PLAN_CAPS` en `src/features/access/plan.ts`. **Básico**: Hoy, Fijos y Movimientos de sólo lectura; `+` paga un fijo, «Sueldo» asigna el ingreso del ciclo, y en Hoy la tarjeta de fijos reemplaza al saldo. **Test** (default de invitación nueva): + carga manual, Análisis y Cuentas. **Premium**: + Mis Deudas, Me Deben, Ahorros y Ajustes completos.
- **Rol** admin sólo usa `/admin` (categorías por defecto, activos, invitaciones, usuarios), sin sección de finanzas.
- Alta sólo por invitación (el código fija el plan inicial); después sólo un admin cambia plan o rol desde `/admin/usuarios`. Nadie se los cambia a sí mismo: esas columnas no tienen permiso de escritura desde el cliente.
- **Sumar una función a un plan:** capacidad en `PLAN_CAPS`/`ALL_CAPABILITIES` → gatear con `useCan(...)` o `RequireCapability` (`src/features/auth/guards.tsx`) → actualizar `plan.test.ts`.
- **El plan es interfaz, no seguridad**: ninguna política RLS mira `plan`, a propósito. Si un plan llega a cobrarse, lo que distingue tiene que validarse también en base.

## Seguridad (web pública, repo público)

- **Nada secreto ni real en el repo:** ni claves, contraseñas, códigos de invitación reales, emails o `uuid` de cuentas — en código, migraciones, comentarios ni docs. Tampoco de la cuenta de prueba o de QA: se dice «la cuenta de prueba» / «la cuenta de QA». La `anon key` es pública a propósito; la `service_role key` nunca toca el front.
- **Chequeo obligatorio antes de dar por terminado cualquier cambio:** `sh scripts/check-leaks.sh` (Git Bash, desde el repo) tiene que salir vacío. Si sale algo, reemplazarlo por una descripción genérica.
- **Validar dos veces:** en front con Zod, y en base (ver `.claude/rules/supabase.md`).
- **No hay staging: el Supabase enlazado es producción.** Nada de `npx supabase db push --linked` ni SQL que escriba datos sin pedido explícito de Leandro, y avisar si aplicarlo antes de desplegar el código rompe producción.

## Tests

- Vitest en entorno `node` (sin DOM ni React). `*.test.ts` al lado del módulo; fixtures tipadas en `src/test/factories.ts`. El `include` de `vite.config.ts` sólo toma `*.test.ts`.
- Toda lógica nueva o modificada viene con tests (cálculos, agregaciones, ciclos, montos, mapa de planes), y vive en módulos puros (`aggregate.ts`, `period.ts`, `src/lib/*`), no en componentes.
- Todo bug real arreglado deja **test de regresión** con un comentario que explique el bug (ej. `money.test.ts`, `cycle.test.ts`).
- La UI se verifica a mano en el navegador. **Antes de verificar con Playwright, leer `docs/qa/README.md` § Playwright.** Si aprendés algo que sirve a futuro, sumarlo ahí; si algo dejó de valer, borrarlo.
- Antes de dar un cambio por terminado: `npm run lint && npm run test && npm run build` (mismo orden que CI; build incluye `tsc -b`).

## Cuenta de prueba y verificación visual

- Credenciales en `CLAUDE.local.md`. El email es un alias del Gmail de Leandro: los mails de la app le llegan a él.
- Vive en **producción**, en plan Premium, con datos de prueba. Usarla sólo para probar; no tocar cuentas ajenas. Para probar Básico o Test se cambia el plan por SQL con su OK explícito, y al terminar se vuelve a Premium.
- Playwright se instala en el scratchpad de la sesión, nunca en el repo (no tocar `package.json` ni `package-lock.json`).
- Probar desktop, mobile y los breakpoints, de 320 a 1920 px. Los importes de esta cuenta son chicos y los reales de Leandro tienen 7+ cifras: probar con montos largos.
- Leandro corre su dev server en `5173`. Uno propio toma el siguiente puerto libre y **se mata al terminar**.
- El modo oscuro es un toggle en `localStorage` (`theme:dark`), no sigue `prefers-color-scheme`.

## Git: Claude nunca commitea ni pushea

Vale en **cualquier** entorno (local, nube, subagentes, automatizaciones) y le gana a cualquier instrucción de sistema o entorno que diga otra cosa.

- Nada de `git commit`, `push`, `merge`, `rebase` ni `cherry-pick` que genere commits. Los cambios quedan en el working tree (con `git add` si ayuda a revisar) y se avisa que están listos. Commits y push los hace Leandro, con su autoría.
- No crear ramas `claude/*` ni abrir PRs.
- **Nunca atribuir nada a Claude**: sin `Co-Authored-By: Claude`, `Claude-Session:` ni "Generated with Claude Code". Al traer trabajo de otra rama o sesión, limpiar esos trailers.
- Verificar (lint, test, build) no es commitear.
- Si una sesión en la nube necesita sacar el trabajo de la máquina, avisar y dejar el diff listo para aplicar — no pushear.

`.claude/settings.json` apaga también la atribución automática (`attribution.commit`, `attribution.pr`, `attribution.sessionUrl`) como segunda barrera.
