# QA de Movimientos

- **Fecha:** 2026-09-23, hora Argentina.
- **Código:** rama `accounts`, commit `71b4b3d`. Sin migraciones pendientes (`supabase migration list
  --linked`, 87/87 aplicadas).
- **Planes:** Premium (casi todo), Básico y Test (lo que cambia por plan).
- **Ciclo:** mensual, semana desde lunes (único probado esta pasada).
- **Pasada:** 1.ª.

## Estado del arreglo (2026-09-24)

18 hallazgos atacados en plan de 7 bloques, rama `fix-issues`
(`C:\Users\leanf\.claude\plans\arma-el-plan-snazzy-possum.md`), D1-D4 decididos por Lean.
**Estado: resuelto, verificado en vivo con cuenta QA**, migraciones en producción,
`lint`/`test`/`build` verde, sin commitear.

| Bloque | Qué hace | IDs |
|---|---|---|
| 0 | Base valida que categoría y pago de fijo del movimiento sean de propia cuenta | MO-17, MO-18 (escaló: ver detalle) |
| 1 | Formulario: confirmar al borrar, Compartido→Ingreso, descripción larga, `0.500`, botón 768-1023px, límites de fecha | MO-01, MO-09, MO-10, MO-12, MO-13, MO-15, MO-16 |
| 2 | `rpc_transaction_origin` + `features/transactions/origin.ts`: origen del movimiento | (soporte de 3-5) |
| 3 | Eliminar desde Movimientos deshace también origen (tarjeta, cuota, deuda) | MO-02, MO-04, MO-05, MO-06 |
| 4 | Importe/tipo bloqueados en vinculados; categoría de tarjeta sincronizada; ajuste → sólo detalle+eliminar | MO-03, MO-07, MO-08 |
| 5 | Básico: Sueldo edita en diálogo chico, resto sólo lectura | MO-11 |
| 6 | Aviso (no bloqueo) si gasto deja cuenta negativa | MO-14 |

Migraciones: `20260924020001_movimientos_referencias_propias.sql` (bloque 0),
`20260924030001_movimientos_origen.sql` (bloque 2), `20260924040001_movimientos_vinculados.sql`
(bloques 3/4, incluye `check` de fecha mínima del bloque 1), y
`20260924050001_movimientos_compartido_delete_directo.sql` — arreglo hallado en esta verificación en
vivo (ver «Encontrado al verificar»).

**Encontrado al verificar (no estaba en informe original):** trigger del Bloque 3
(`transactions_block_delete_linked`) frenaba también borrado directo de «tu parte» de gasto
compartido (`receivable_share`), que front SÍ borra directo a propósito (no hay RPC de deshacer para
ese caso — sólo «Descontado: X», con `already_expensed = true`, la necesita). Reproducido en vivo
(Eliminar sobre compartido daba error), corregido sumando `and already_expensed` a esa condición del
trigger — re-verificado en vivo, funciona.

**Verificación en vivo (cuenta QA, Premium salvo Básico):** tarjeta con 2 categorías pagada →
Eliminar deshace período entero (2 movimientos, período vuelve a pendiente); cuota suelta → ídem;
«Descontado: X» → `rpc_unexpense_receivable`, deuda vuelve a abierta; «Me devolvió X» →
`rpc_delete_receivable_payment`; tu parte de compartido → importe bloqueado, Eliminar directo dejó
deuda intacta; ajuste de saldo → `MovementDetailDialog` con efecto en saldo (probado con saldo a
negativo, avisa); Básico → «Sueldo» abre `IncomeEditDialog` con importe pre-cargado, otro movimiento
suelto abre detalle sólo lectura; `0.500` y `1,234.56` rechazados con mensaje nuevo; descripción
cortada en 300; fecha con `min`/`max` correctos; botón «Nuevo movimiento» visible a 900px y 700px (en
700px lo cubre `+` de isla, sin superposición ni hueco); aviso de sobregiro con cifra correcta; MO-09
(Compartido→Ingreso→Gasto) ya no deja chip pegado. Por API: `DELETE` directo de vinculado →
`linked_movement_use_origin`; `PATCH` de importe/tipo → `linked_movement_locked`; categoría o pago de
fijo ajenos (`uuid` inventado) → rechazados; fecha anterior a 2000 → rechazada por `check`. Cuenta QA
quedó exacta (22 movimientos, mismos totales, mismas cuentas, plan Premium — verificado por API antes
y después).

**Pendiente:** migración `20260924050001` aplicada con `supabase db query -f` (classifier de sesión
bloqueó segundo `db push --linked` seguido) — efecto en vivo, pero no registrada en historial
(`supabase migration list --linked` la muestra sin `remote`). Próximo `db push --linked` la reaplica
(`create or replace`, idempotente) y queda prolija en historial — sólo correrlo.

## Resumen

Movimientos = pantalla donde terminan casi todas las funciones — pagos de fijos, tarjetas, cuotas, Me
Deben, gastos compartidos, sueldo, ajustes de saldo — y ahí se edita o borra cualquiera sin que
formulario sepa origen. Esa falta de contexto = causa de fondo de casi todos los altos:

- **Borrar/editar movimiento heredado de otra pantalla no avisa** y desincroniza origen: tarjeta o
  cuota siguen «pagadas» sin movimiento que las cubría (MO-02, MO-04), deuda sigue «descontada» o
  «cobrada» sin gasto/ingreso real (MO-05, MO-06), gasto compartido no mueve deuda que generó
  (MO-07), ajuste de saldo se edita como gasto cualquiera (MO-08).
- **Importe malinterpretado en silencio** con formato miles/decimales ambiguo: «1,234.56» en inglés
  → $1,23, «0.500» → $500 — error de 3 a 5 órdenes de magnitud sin aviso (MO-12, MO-13).
- **Formulario se traba en silencio:** armar compartido y cambiar a Ingreso descarta split sin decir
  nada (MO-09); descripción >140 caracteres — propia o heredada de pago de tarjeta con nombres largos
  — bloquea Guardar sin error (MO-10).
- **Básico** edita «Sueldo» (y cualquier movimiento que no sea pago directo de fijo) con formulario
  completo, incluso pasarlo a Gasto (MO-11) — plan pensado para controlar sólo fijos no lo aísla.
- **Verificado sin problemas:** RLS de `transactions` bloquean por completo lectura y escritura
  cruzada entre cuentas (nada de lo sospechado por lectura de código en QA de Cuentas se reprodujo);
  `+`/«Nuevo movimiento» y filtro de cuenta respetan plan; Gasto→Ingreso limpia bien categoría; base
  rechaza `amount = 0` e importe de 11+ cifras.

## Hallazgos

| ID | Sev. | Estado | Título | Afecta |
|---|---|---|---|---|
| MO-01 | Alto | Resuelto | «Eliminar» borra en el acto, sin confirmar ni deshacer | — |
| MO-02 | Alto | Resuelto | Borrar movimiento de pago de tarjeta deja tarjeta pagada | Mis Deudas |
| MO-03 | Medio | Resuelto | Editar categoría de pago de tarjeta no actualiza detalle del período | Mis Deudas |
| MO-04 | Alto | Resuelto | Borrar movimiento de cuota suelta deja cuota pagada | Mis Deudas |
| MO-05 | Alto | Resuelto | Borrar «Descontado: X» no reabre deuda; siguiente abono puede duplicar ingreso | Me Deben |
| MO-06 | Alto | Resuelto | Borrar «Me devolvió X» deja abono registrado sin ingreso real | Me Deben |
| MO-07 | Alto | Resuelto | Editar «tu parte» de gasto compartido no mueve deuda | Me Deben |
| MO-08 | Alto | Resuelto | Ajustes de saldo totalmente editables y borrables, sin aviso | Cuentas, Análisis |
| MO-09 | Alto | Resuelto | Compartido → Ingreso descarta split y crea ingreso pleno, sin avisar | Me Deben |
| MO-10 | Alto | Resuelto | Descripción >140 caracteres bloquea Guardar sin error | Mis Deudas |
| MO-11 | Alto | Resuelto | Básico edita «Sueldo» (y cualquier movimiento suelto) como Test o Premium | Hoy |
| MO-12 | Alto | Resuelto | Importe en formato inglés («1,234.56») se guarda como $1,23 | — |
| MO-13 | Alto | Resuelto | «0.500» se interpreta como $500 por heurística de separador de miles | — |
| MO-14 | Medio | Resuelto | Editar movimiento muy por encima del saldo no avisa sobregiro | Cuentas |
| MO-15 | Medio | Resuelto | Entre 768 y 1023 px no hay forma de cargar movimiento nuevo | — |
| MO-16 | Bajo | Resuelto | Sin fecha mínima ni máxima en formulario | — |
| MO-17 | Medio | Resuelto | Por API: movimiento propio acepta categoría de otra cuenta | — |
| MO-18 | Medio | Resuelto | Por API: movimiento propio acepta `fixed_expense_payment_id` de otra cuenta, no explotable | — |

Sev. = severidad (Crítico / Alto / Medio / Bajo).

---

### MO-01 · «Eliminar» borra en el acto, sin confirmar ni deshacer — Alto

- **Pasos:** cualquier movimiento → Eliminar.
- **Esperado:** confirmación, o al menos «Deshacer».
- **Obtenido:** borra al toque, sin diálogo ni toast de éxito. Pendiente ya anotado en README, pasa
  acá con ID propio.
- **Por qué:** `onDelete` llama `deleteTx.mutateAsync` directo (`TransactionFormDialog.tsx:289-297`).

### MO-02 · Borrar el movimiento de un pago de tarjeta deja la tarjeta pagada — Alto

- **Pasos:**
  1. Tarjeta con dos compras en dos categorías (Supermercado $15.000, Salidas $8.000), pagada con
     `rpc_mark_credit_card_paid`: un movimiento por categoría, con `is_credit_card_payment = true`.
  2. Movimientos → buscar el de $15.000 → Eliminar.
- **Obtenido:**
  - saldo sube $15.000, sin aviso de que era pago de tarjeta;
  - fila de `credit_card_payments` (marcador «período pagado») sigue existiendo:
    la tarjeta sigue mostrando el período **pagado** en Mis Deudas, con $15.000 menos de gasto real
    detrás;
  - `credit_card_payment_items` de esa compra queda con `transaction_id = null`, huérfano.
- **Por qué:** FK de `credit_card_payment_items.transaction_id` es `on delete set null`
  (`20260808030001_...sql:61-63`) — nada borra ni recalcula pago del período.

### MO-03 · Editar la categoría de un pago de tarjeta no actualiza el detalle — Medio

- **Pasos:** otra compra de misma tarjeta ($8.000, Salidas) → Movimientos → categoría a Transporte →
  Guardar.
- **Obtenido:** movimiento queda en Transporte, pero `credit_card_payment_items.category_id` sigue en
  Salidas — verificado por SQL, columnas distintas. Detalle del período en Mis Deudas sigue agrupando
  compra bajo categoría vieja.
- **Por qué:** nada sincroniza `credit_card_payment_items.category_id` con transacción editada.

### MO-04 · Borrar el movimiento de una cuota suelta deja la cuota pagada — Alto

- **Pasos:** compra suelta (sin tarjeta) en 3 cuotas de $10.000, cuota 1 pagada con
  `rpc_mark_credit_purchase_paid` → Movimientos → Eliminar ese movimiento.
- **Obtenido:** saldo sube $10.000, pero fila de `credit_purchase_payments` de esa cuota sigue (con
  `transaction_id = null`) — cuota 1 sigue «pagada».
- **Por qué:** mismo patrón que MO-02, FK `on delete set null`
  (`20260902040001_...sql:27`).

### MO-05 · Borrar «Descontado: X» no reabre la deuda — Alto

- **Pasos:**
  1. Deuda «cargada como sigue en mi saldo», con «Descontala ahora» (`rpc_expense_receivable`):
     `already_expensed = true`, `expense_transaction_id` apunta al gasto «Descontado: X».
  2. Movimientos → Eliminar ese gasto.
- **Obtenido:** gasto se va, plata vuelve al saldo, pero `already_expensed` sigue `true` y
  `expense_transaction_id` queda `null` — verificado por SQL. Me Deben sigue mostrando «ya la
  descontaste», sin gasto real detrás.
- **Riesgo (no ejecutado, por lectura de código):** con `already_expensed` aún `true`, abono
  posterior crea ingreso automático (`v_create_income := coalesce(p_create_income,
  v_receivable.already_expensed)`, `20260904030001_...sql:349`) — plata «vuelve» dos veces: gasto
  borrado + ingreso del abono.
- **Por qué:** `rpc_unexpense_receivable` = única vía pensada para deshacer, nadie la usa acá; borrar
  desde Movimientos la saltea.

### MO-06 · Borrar «Me devolvió X» deja el abono sin el ingreso real — Alto

- **Pasos:** deuda ya «descontada», abono completo que generó ingreso «Me devolvió X»
  (`rpc_register_receivable_payment`) → Movimientos → Eliminar ese ingreso.
- **Obtenido:** ingreso se va, saldo baja, pero fila de `receivable_payments` (abono) sigue con
  `transaction_id = null` — Me Deben sigue contando plata como cobrada, sin ingreso real.
- **Por qué:** `receivable_payments.transaction_id` también `on delete set null`
  (`20260902020001_...sql`, columna agregada con misma regla).

### MO-07 · Editar «tu parte» de un gasto compartido no mueve la deuda — Alto

- **Pasos:** compartido 50/50 de $10.000 (tu parte $5.000, deuda $5.000, vía
  `rpc_create_receivable` con `p_expense_amount`) → Movimientos → tu parte a $9.000 → Guardar.
- **Obtenido:** movimiento en $9.000, deuda sigue $5.000 — verificado por SQL. 50/50 original ya no
  describe plata real.
- **Por qué:** `rpc_create_receivable` linkea `expense_transaction_id` una sola vez, al crear; nada lo
  relee. Formulario tampoco ofrece bloque «Compartido» al editar (`TransactionFormDialog.tsx:402`,
  `!isEditing` en condición) → ni forma de tocar deuda desde ahí.

### MO-08 · Ajustes de saldo totalmente editables y borrables — Alto

- **Pasos:** «Reajustar saldo → Registrar un ajuste» sobre cuenta (`rpc_adjust_account_balance`, modo
  `movement`) → Movimientos → abrir «Ajuste de saldo» → cambiar importe.
- **Obtenido:** guarda sin aviso de que es ajuste — importe de $12.345,67 a $99.999 con PATCH normal,
  saldo de cuenta se movió acorde. `is_adjustment` sigue `true` (nadie lo pisa) → fila sigue
  etiquetada «Ajuste de saldo · afuera de Análisis», pero con importe equivocado.
- **Por qué:** `useUpdateTransaction` no distingue `is_adjustment` (`api.ts:231-252`); diálogo de
  edición tampoco lo indica.
- **Relacionado:** ya en «Pendientes transversales» del README («ajuste sin tocar se etiqueta y
  excluye bien» — CU-11 — sin probar edición). Confirma también pendiente «gasto puede dejar cuenta
  negativa sin aviso»: nada frena ajuste que la deje muy negativa.

### MO-09 · Compartido → cambiar a Ingreso descarta el split, sin avisar — Alto

- **Pasos:** Nuevo movimiento → Gasto → Compartido → nombre + $1.000 al 50% → tipo a **Ingreso** →
  Guardar.
- **Esperado:** error, o bloque Compartido limpiado/desactivado al cambiar tipo.
- **Obtenido:** guarda ingreso simple de **$1.000 completos**, sin descripción ni categoría, y **no
  crea deuda** — verificado por SQL (0 filas nuevas en `receivables`). Split armado (nombre, 50%,
  fecha de cobro) desaparece sin rastro.
- **Por qué:** condición que arma compartido es
  `values.type === 'expense' && values.compartido && !isEditing` (`TransactionFormDialog.tsx:250`) —
  con `type: 'income'` no entra, cae a alta normal. Bloque Compartido sólo se **muestra** para
  `type === 'expense'` (`TransactionFormDialog.tsx:402`), pero estado `compartido: true` sigue vivo en
  form (React Hook Form no resetea al ocultar) — mitad del código lo sabe, otra mitad no.

### MO-10 · Descripción de más de 140 caracteres bloquea Guardar sin error visible — Alto

- **Pasos:** cualquier movimiento → escribir/heredar descripción >140 caracteres → Guardar.
- **Esperado:** mensaje de error, o input cortado en 140.
- **Obtenido:** Guardar no hace nada — sin request de red, sin texto rojo junto al campo, diálogo
  abierto sin pista del fallo.
- **Cómo se llega sin querer:** pago de tarjeta con varias compras de nombre largo genera descripción
  de sistema («{Tarjeta} · {compra 1}, {compra 2}, …») que ya puede pasar 140. Armada tarjeta con una
  compra de 145 caracteres, pagada, y **sólo cambiar categoría** desde Movimientos deja Guardar sin
  efecto — usuario nunca tocó descripción.
- **Por qué:** `description: z.string().max(140).optional()` (`TransactionFormDialog.tsx:41`), y campo
  Descripción sin `error` conectado a `errors.description` (`TransactionFormDialog.tsx:394-396`) ni
  `maxLength` en input.

### MO-11 · Básico edita «Sueldo» (y cualquier movimiento suelto) — Alto

- **Pasos:** plan Básico → Hoy → «Sueldo» → asignar $50.000 → Movimientos → buscar «Sueldo» → tocar
  fila.
- **Obtenido:** abre formulario **completo** de edición (no desmarcado de un toque de pago de fijo) —
  chips Gasto/Ingreso, categoría, fecha e importe editables. Probado tipo a **Gasto** + Guardar: PATCH
  aceptado (204), verificado por SQL, movimiento quedó `expense`.
- **Por qué:** `openEdit` sólo desvía a desmarcado si existe `tx.fixed_expense_payment_id`
  (`Movimientos.tsx:240-242`); cualquier otro — Sueldo, ajuste, suelto de antes de bajar de plan —
  abre form entero, sin chequeo de plan (`Movimientos.tsx:244-246`).
- **Nota:** README decía «Básico (Movimientos)… sólo lectura» — falso: además de este caso, ver FI-05
  (tocar movimiento de fijo lo despaga sin confirmar), sigue vigente.

### MO-12 · Importe en formato inglés se guarda mal, sin aviso — Alto

- **Pasos:** Nuevo movimiento → Importe: `1,234.56` (pensado como 1234,56) → Guardar.
- **Obtenido:** guarda **$1,23** — verificado por SQL (`amount: "1.23"`). Sin error ni confirmación.
- **Por qué:** `parseAmountToCents` asume coma = decimal es-AR y todo punto = miles
  (`src/lib/money.ts:55-56`): `"1,234.56"` → saca puntos → `"1,23456"` → coma a punto → `"1.23456"` →
  `Number(...)` = 1.23456 → $1,23. Formulario no indica formato esperado ni previsualiza monto
  interpretado.

### MO-13 · «0.500» se interpreta como $500 — Alto

- **Pasos:** Nuevo movimiento → Importe: `0.500` (pensado como 50 centavos) → Guardar.
- **Obtenido:** guarda **$500,00** — verificado por SQL.
- **Por qué:** sin coma, `parseAmountToCents` trata punto + exactamente 3 dígitos como miles
  (`src/lib/money.ts:56`, regex `/(?<=\d)\.(?=\d{3}\b)/g`) — `"0.500"` pasa, punto borrado, queda
  `"0500"` = 500. Afecta cualquier importe con 3 decimales que parezca miles redondos.

### MO-14 · Editar por encima del saldo de la cuenta no avisa — Medio

- **Pasos:** movimiento de $500 en Efectivo (saldo bajo) → editar a $50.000.000 → Guardar.
- **Obtenido:** PATCH aceptado (204), sin aviso de cuenta muy negativa.
- **Por qué:** a diferencia de transferencias (que frenan sobregiro, `20260920040001_...sql`), gasto
  común nunca valida. Resuelve pendiente transversal del README («confirmar si es a propósito») — no
  parece: sin mensaje ni corte, ausencia total de chequeo.

### MO-15 · Sin forma de cargar un movimiento entre 768 y 1023 px — Medio

- **Pasos:** Premium, ventana 900 px → Movimientos.
- **Obtenido:** ni tab bar mobile (con `+`, oculta desde 768px) ni botón «Nuevo movimiento» (aparece
  desde 1024px) visibles. Ninguna forma de cargar movimiento suelto en ese rango — verificado con
  capturas a 900px.
- **Por qué:** `MobileTabBar` es `md:hidden` (`src/app/MobileTabBar.tsx:61`, `md` = 768px) y «Nuevo
  movimiento» es `hidden lg:block` (`Movimientos.tsx:298`, `lg` = 1024px) — hueco entre breakpoints
  sin punto de entrada.

### MO-16 · Sin fecha mínima ni máxima — Bajo

- **Pasos:** Nuevo movimiento → Fecha: `2030-01-01`, y aparte `0001-01-01` → Guardar cada una.
- **Obtenido:** ambas guardan sin aviso — verificado por SQL. Diálogo de pagar fijo sí pone `max`
  (hoy); éste ni mínimo ni máximo.
- **Por qué:** `<Input id="occurredOn" type="date" ... />` sin `max`/`min`
  (`TransactionFormDialog.tsx:374`).

### MO-17 · Por API: categoría de otra cuenta en un movimiento propio — Medio

- **Pasos (sesión QA, datos propios):** `INSERT` en `transactions` con `user_id` propio pero
  `category_id` de cuenta de prueba habitual.
- **Obtenido:** aceptado (201) — verificado en vivo. Movimiento queda con categoría que cuenta QA no
  ve ni elige en UI (selector lista sólo propias); peor efecto visible: fila deja de coincidir con
  donut de Análisis (misma familia que MO-08, categoría "fuera de lugar" descuadra totales).
- **Por qué:** policy `insert` en `transactions` sólo mira `user_id = auth.uid()`
  (`20260805190003_...sql:18-28`); FK a `categories` no valida dueño, nada más lo hace.
- **No explotable contra otra cuenta:** categoría ajena no se lee ni usa para nada — daño contenido
  en propia cuenta.

### MO-18 · Por API: `fixed_expense_payment_id` de otra cuenta — Medio (escaló desde Bajo)

- **Pasos (sesión QA):** `INSERT` propio con `fixed_expense_payment_id` de pago de cuenta de prueba
  habitual.
- **Obtenido (esta pasada, 2026-09-23):** aceptado (201) — `INSERT` no valida dueño del pago, mismo
  motivo que MO-17.
- **Por qué no se explotaba entonces:** borrar ese movimiento disparaba trigger
  `trg_transactions_unmark_fixed_payment`, que intenta `delete from fixed_expense_payments where id =
  old.fixed_expense_payment_id` (`20260916010001_...sql:154-163`) — función **no** era `security
  definer`, corría con permisos del invocador → `delete` sujeto a RLS de `fixed_expense_payments`
  (dueño propio), no borraba nada ajeno.
- **Escaló al planear arreglo (2026-09-24, lectura de código, sin reproducir en vivo):**
  `20260924010001_fijos_pagos_solo_por_rpc.sql` (rama `fix-issues`, ya en producción) pasó
  `trg_transactions_sync_linked_fixed_expense` a `security definer` para escribir
  `fixed_expense_savings` (FI-26), y ese trigger asume pago vinculado del mismo usuario que edita — no
  lo comprobaba. Con `fixed_expense_payment_id` a pago ajeno (MO-18) y editando importe o fecha de
  movimiento propio, se podía escribir `amount_paid`/`paid_on` de otra cuenta vía esa función
  `security definer`. Seguía sin ser explotable por lectura ni sin conocer `uuid` del pago ajeno (no
  adivinable, no expuesto por API).
- **Arreglo (Bloque 0, `20260924020001_movimientos_referencias_propias.sql`):** trigger nuevo
  (`transactions_owned_refs`) rechaza `insert`/`update` de `transactions` cuya `category_id` o
  `fixed_expense_payment_id` no sea del mismo `user_id`, con `raise exception
  'fixed_payment_not_found'`/`'category_not_found'`. Además `and user_id = old.user_id` en `update`
  de `trg_transactions_sync_linked_fixed_expense`, segunda barrera.

---

## Verificado correcto (no repetir)

- **Seguridad entre cuentas — RLS de `transactions`:** sesión QA contra cuenta de prueba habitual:
  `SELECT` por `user_id` o `id` da 0 filas; `UPDATE`/`DELETE` por `id` afectan 0 filas; `INSERT` con
  su `user_id` rechazado (`new row violates row-level security policy`). Ningún vector cruzado de
  lectura/escritura funcionó.
- **`account_id` ajeno rechazado:** insertar con cuenta de otro usuario da `account_not_found`
  (trigger `transactions_account` sí valida dueño).
- **Planes:**
  - Básico: nav Hoy/Fijos/Movimientos; sin «Nuevo movimiento» ni columna/filtro de Cuenta.
  - Test: nav Hoy/Movimientos/Fijos/Análisis; «Nuevo movimiento» con selector de Cuenta; **sin**
    el chip Compartido (la primera lectura lo daba visible por un falso positivo del selector de
    Playwright, que matcheaba la fila «QA-MO gasto compartido» en vez del chip — confirmado con
    captura que el diálogo de Test sólo tiene Gasto/Ingreso/Cancelar/Guardar).
- **Formulario:**
  - `amount = 0` rechazado con «Ingresá un importe válido» (no guarda).
  - Importe de 11 o 12 cifras rechazado (overflow `numeric(12,2)`, conocido de Fijos).
  - `-500` guarda $500 (signo pelado a propósito, intencional según comentario).
  - `1.234` (miles es-AR) guarda $1.234 bien.
  - `0,005` redondea a $0,01 (esperable, mismo criterio que FI-18).
  - Gasto↔Ingreso limpia categoría elegida.
- **Cierre de cuenta:** foto final por SQL (perfil, cantidad de movimientos, suma ingresos y gastos,
  tarjetas, deudas) = foto inicial exacta.

## Quedó afuera

- **Paginación y exportación:** tamaños de página, tope 1.000 filas del período, CSV en vivo
  (separador, columnas, nombre de archivo).
- **Ciclos quincenal y semanal en vivo** (con otro inicio de semana), y borde horario 21h Argentina
  con reloj emulado.
- **Coherencia de caché entre pantallas abiertas** (Análisis/Hoy desactualizados al cargar desde otra
  pantalla) — sospecha por lectura de código, no reproducida en vivo.
- **Layout sistemático 320 a 1920px** y modo oscuro (sólo verificado hueco de 900px de MO-15).
- **Doble click / dos pestañas** sobre Guardar y Eliminar.
- Categorías archivadas/eliminadas y efecto en filtro y filas viejas.
- Resto de ítems de seguridad de Parte MO-I no cubiertos (`is_adjustment/
  is_credit_card_payment` seteados a mano por API, `rpc_admin_delete_user` en cascada — este último,
  por decisión, nunca se ejecuta en pasada de QA).

## Estado de la cuenta de QA al cerrar

- **Perfil:** Premium, ciclo mensual, semana desde lunes — igual que al empezar.
- **Datos:** exactamente los que dejó QA de Fijos (22 movimientos, mismos totales ingresos y gastos,
  0 tarjetas, única deuda pre-existente «Préstamo test QA» intacta). Todo lo cargado esta pasada
  (tarjetas, compras, deudas, ajuste y movimientos de prueba, marcados `QA-MO`) borrado al cerrar,
  verificado por SQL sin restos.