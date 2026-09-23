# QA de Movimientos

- **Fecha:** 2026-09-23, hora Argentina.
- **Código:** rama `accounts`, commit `71b4b3d`. Sin migraciones pendientes (`supabase migration list
  --linked`, 87/87 aplicadas).
- **Planes:** Premium (casi todo), Básico y Test (lo que cambia por plan).
- **Ciclo:** mensual, semana desde el lunes (el único probado en esta pasada).
- **Pasada:** 1.ª.

## Resumen

Movimientos es la pantalla donde terminan casi todas las funciones de la app — pagos de fijos,
tarjetas, cuotas, Me Deben, gastos compartidos, sueldo y ajustes de saldo — y desde ahí se puede
editar o borrar cualquiera sin que el formulario sepa de dónde vino. Esa falta de contexto es la
causa de fondo de casi todos los hallazgos altos:

- **Borrar o editar un movimiento heredado de otra pantalla no avisa nada** y deja el estado de
  origen desincronizado: una tarjeta o una cuota siguen «pagadas» sin el movimiento que las cubría
  (MO-02, MO-04), una deuda sigue «descontada» o «cobrada» sin su gasto o su ingreso real (MO-05,
  MO-06), un gasto compartido no mueve la deuda que generó (MO-07), y un ajuste de saldo se edita
  como si fuera un gasto cualquiera (MO-08).
- **El importe se malinterpreta en silencio** con un formato de miles/decimales ambiguo: un
  «1,234.56» pensado en inglés se guarda como $1,23, y un «0.500» se guarda como $500 — un error de
  tres a cinco órdenes de magnitud sin ningún aviso (MO-12, MO-13).
- **El formulario se traba en silencio:** armar un gasto compartido y después cambiarlo a Ingreso
  descarta todo el split sin decir nada (MO-09); una descripción de más de 140 caracteres — propia o
  heredada de un pago de tarjeta con nombres largos — bloquea Guardar sin mostrar ningún error
  (MO-10).
- **Básico** puede editar «Sueldo» (y cualquier movimiento que no sea el pago directo de un fijo)
  con el formulario completo, incluso pasarlo a Gasto (MO-11) — el plan pensado para controlar sólo
  fijos no lo aísla de eso.
- **Lo verificado sin problemas:** las RLS de `transactions` bloquean por completo la lectura y la
  escritura cruzada entre cuentas (nada de lo que preocupaba por lectura de código en el QA de
  Cuentas se pudo reproducir); el `+`/«Nuevo movimiento» y el filtro de cuenta respetan el plan;
  cambiar de Gasto a Ingreso limpia bien la categoría elegida; la base rechaza `amount = 0` y un
  importe de 11+ cifras.

## Hallazgos

| ID | Sev. | Estado | Título | Afecta |
|---|---|---|---|---|
| MO-01 | Alto | Abierto | «Eliminar» borra en el acto, sin confirmar ni deshacer | — |
| MO-02 | Alto | Abierto | Borrar el movimiento de un pago de tarjeta deja la tarjeta pagada | Mis Deudas |
| MO-03 | Medio | Abierto | Editar la categoría de un pago de tarjeta no actualiza el detalle del período | Mis Deudas |
| MO-04 | Alto | Abierto | Borrar el movimiento de una cuota suelta deja la cuota pagada | Mis Deudas |
| MO-05 | Alto | Abierto | Borrar «Descontado: X» no reabre la deuda; el siguiente abono puede duplicar el ingreso | Me Deben |
| MO-06 | Alto | Abierto | Borrar «Me devolvió X» deja el abono registrado sin el ingreso real | Me Deben |
| MO-07 | Alto | Abierto | Editar «tu parte» de un gasto compartido no mueve la deuda | Me Deben |
| MO-08 | Alto | Abierto | Ajustes de saldo totalmente editables y borrables, sin ningún aviso | Cuentas, Análisis |
| MO-09 | Alto | Abierto | Compartido → cambiar a Ingreso descarta el split y crea un ingreso pleno, sin avisar | Me Deben |
| MO-10 | Alto | Abierto | Una descripción de más de 140 caracteres bloquea Guardar sin mostrar ningún error | Mis Deudas |
| MO-11 | Alto | Abierto | Básico edita «Sueldo» (y cualquier movimiento suelto) como Test o Premium | Hoy |
| MO-12 | Alto | Abierto | Un importe en formato inglés («1,234.56») se guarda como $1,23 | — |
| MO-13 | Alto | Abierto | «0.500» se interpreta como $500 por la heurística de separador de miles | — |
| MO-14 | Medio | Abierto | Editar un movimiento muy por encima del saldo de su cuenta no avisa sobregiro | Cuentas |
| MO-15 | Medio | Abierto | Entre 768 y 1023 px no hay forma de cargar un movimiento nuevo | — |
| MO-16 | Bajo | Abierto | Sin fecha mínima ni máxima en el formulario | — |
| MO-17 | Medio | Abierto | Por API: un movimiento propio acepta la categoría de otra cuenta | — |
| MO-18 | Bajo | Verificado seguro | Por API: un movimiento propio acepta un `fixed_expense_payment_id` de otra cuenta, pero no se puede explotar | — |

Sev. = severidad (Crítico / Alto / Medio / Bajo).

---

### MO-01 · «Eliminar» borra en el acto, sin confirmar ni deshacer — Alto

- **Pasos:** cualquier movimiento → Eliminar.
- **Esperado:** una confirmación, o al menos un «Deshacer».
- **Obtenido:** se borra al toque, sin diálogo ni toast de éxito. Es el pendiente que ya estaba
  anotado en el README, se pasa acá con su propio ID.
- **Por qué:** `onDelete` llama a `deleteTx.mutateAsync` directo (`TransactionFormDialog.tsx:289-297`).

### MO-02 · Borrar el movimiento de un pago de tarjeta deja la tarjeta pagada — Alto

- **Pasos:**
  1. Tarjeta con dos compras en dos categorías (Supermercado $15.000, Salidas $8.000), pagada con
     `rpc_mark_credit_card_paid`: un movimiento por categoría, con `is_credit_card_payment = true`.
  2. Movimientos → buscar el de $15.000 → Eliminar.
- **Obtenido:**
  - el saldo sube $15.000, sin aviso de que era un pago de tarjeta;
  - la fila de `credit_card_payments` (el marcador de «este período está pagado») sigue existiendo:
    la tarjeta sigue mostrando el período **pagado** en Mis Deudas, con $15.000 menos de gasto real
    detrás;
  - el `credit_card_payment_items` de esa compra queda con `transaction_id = null`, huérfano.
- **Por qué:** el FK de `credit_card_payment_items.transaction_id` es `on delete set null`
  (`20260808030001_...sql:61-63`) — nada borra ni recalcula el pago del período.

### MO-03 · Editar la categoría de un pago de tarjeta no actualiza el detalle — Medio

- **Pasos:** con la otra compra de la misma tarjeta ($8.000, categoría Salidas) → Movimientos →
  cambiarle la categoría a Transporte → Guardar.
- **Obtenido:** el movimiento queda en Transporte, pero `credit_card_payment_items.category_id` sigue
  en Salidas — verificado por SQL, las dos columnas quedan distintas. El detalle del período de la
  tarjeta en Mis Deudas sigue agrupando esa compra bajo la categoría vieja.
- **Por qué:** nada sincroniza `credit_card_payment_items.category_id` con la transacción editada.

### MO-04 · Borrar el movimiento de una cuota suelta deja la cuota pagada — Alto

- **Pasos:** compra suelta (sin tarjeta) en 3 cuotas de $10.000, cuota 1 pagada con
  `rpc_mark_credit_purchase_paid` → Movimientos → Eliminar ese movimiento.
- **Obtenido:** el saldo sube $10.000, pero la fila de `credit_purchase_payments` de esa cuota sigue
  existiendo (con `transaction_id = null`) — la cuota 1 sigue «pagada» para la compra.
- **Por qué:** mismo patrón que MO-02, FK `on delete set null`
  (`20260902040001_...sql:27`).

### MO-05 · Borrar «Descontado: X» no reabre la deuda — Alto

- **Pasos:**
  1. Deuda «cargada como sigue en mi saldo», con «Descontala ahora» (`rpc_expense_receivable`):
     `already_expensed = true`, `expense_transaction_id` apunta al gasto «Descontado: X».
  2. Movimientos → Eliminar ese gasto.
- **Obtenido:** el gasto se va y la plata vuelve al saldo, pero `already_expensed` sigue en `true` y
  `expense_transaction_id` queda en `null` — verificado por SQL. En Me Deben la deuda sigue mostrando
  el estado de «ya la descontaste», sin el gasto real detrás.
- **Riesgo (no ejecutado, directo de leer el código):** con `already_expensed` todavía en `true`, un
  abono después crea un ingreso automáticamente (`v_create_income := coalesce(p_create_income,
  v_receivable.already_expensed)`, `20260904030001_...sql:349`) — la plata «vuelve» dos veces:
  una porque el gasto se borró, y otra con el ingreso del abono.
- **Por qué:** `rpc_unexpense_receivable` es la única forma pensada para deshacer esto y no la usa
  nadie acá; borrar desde Movimientos la saltea.

### MO-06 · Borrar «Me devolvió X» deja el abono sin el ingreso real — Alto

- **Pasos:** deuda ya «descontada», con un abono completo que generó el ingreso «Me devolvió X»
  (`rpc_register_receivable_payment`) → Movimientos → Eliminar ese ingreso.
- **Obtenido:** el ingreso se va y el saldo baja, pero la fila de `receivable_payments` (el abono)
  sigue existiendo con `transaction_id = null` — la deuda sigue contando esa plata como cobrada en Me
  Deben, aunque el ingreso real ya no está.
- **Por qué:** `receivable_payments.transaction_id` también es `on delete set null`
  (`20260902020001_...sql`, columna agregada con la misma regla).

### MO-07 · Editar «tu parte» de un gasto compartido no mueve la deuda — Alto

- **Pasos:** gasto compartido 50/50 de $10.000 (tu parte $5.000, deuda $5.000, vía
  `rpc_create_receivable` con `p_expense_amount`) → Movimientos → cambiar el importe de tu parte a
  $9.000 → Guardar.
- **Obtenido:** el movimiento queda en $9.000, pero la deuda sigue en $5.000 — verificado por SQL. El
  50/50 original ($5.000 y $5.000) ya no describe la plata real.
- **Por qué:** `rpc_create_receivable` sólo linkea `expense_transaction_id` una vez, al crear; nada
  vuelve a leerlo. El formulario tampoco ofrece el bloque «Compartido» al editar
  (`TransactionFormDialog.tsx:402`, `!isEditing` en la condición), así que no hay ni forma de tocar
  la deuda desde ahí.

### MO-08 · Ajustes de saldo totalmente editables y borrables — Alto

- **Pasos:** «Reajustar saldo → Registrar un ajuste» sobre una cuenta (`rpc_adjust_account_balance`,
  modo `movement`) → Movimientos → abrir el «Ajuste de saldo» → cambiarle el importe.
- **Obtenido:** se guarda sin ningún aviso de que es un ajuste — el importe cambió de $12.345,67 a
  $99.999 con un PATCH normal, y el saldo de la cuenta se movió en consecuencia. `is_adjustment` sigue
  en `true` (nadie lo pisa), así que la fila sigue etiquetada «Ajuste de saldo · afuera de Análisis» en
  la lista, pero ahora por el importe equivocado.
- **Por qué:** `useUpdateTransaction` no distingue `is_adjustment` (`api.ts:231-252`); el formulario
  tampoco lo indica en ningún lado del diálogo de edición.
- **Relacionado:** esto ya estaba en «Pendientes transversales» del README («un ajuste sin tocar se
  etiqueta y se excluye bien» — CU-11 — pero no se había probado editarlo). Confirma también el
  pendiente «un gasto puede dejar una cuenta en negativo sin aviso»: nada frena un ajuste que la deje
  muy negativa.

### MO-09 · Compartido → cambiar a Ingreso descarta el split, sin avisar — Alto

- **Pasos:** Nuevo movimiento → Gasto → Compartido → nombre + $1.000 al 50% → cambiar el tipo a
  **Ingreso** → Guardar.
- **Esperado:** un error, o que el bloque Compartido se limpie/desactive al cambiar de tipo.
- **Obtenido:** se guarda un ingreso simple de **$1.000 completos**, sin descripción ni categoría, y
  **no se crea ninguna deuda** — verificado por SQL (0 filas nuevas en `receivables`). El split
  armado (nombre, 50%, fecha de cobro) desaparece sin dejar rastro.
- **Por qué:** la condición que arma el gasto compartido es
  `values.type === 'expense' && values.compartido && !isEditing` (`TransactionFormDialog.tsx:250`) —
  al pasar a `type: 'income'` esa rama no entra más, y cae directo al alta normal. El bloque
  Compartido del formulario sólo se **muestra** para `type === 'expense'`
  (`TransactionFormDialog.tsx:402`), pero el estado `compartido: true` sigue vivo en el form (React
  Hook Form no lo resetea al ocultar el bloque) — la mitad del código lo sabe y la otra mitad no.

### MO-10 · Descripción de más de 140 caracteres bloquea Guardar sin error visible — Alto

- **Pasos:** cualquier movimiento → escribir/heredar una descripción de más de 140 caracteres →
  Guardar.
- **Esperado:** un mensaje de error, o el input cortado en 140.
- **Obtenido:** Guardar no hace nada — no sale ninguna request de red, no aparece ningún texto en
  rojo cerca del campo, y el diálogo sigue abierto sin ninguna pista de qué falló.
- **Cómo se llega sin querer:** un pago de tarjeta con varias compras de nombre largo genera una
  descripción de sistema («{Tarjeta} · {compra 1}, {compra 2}, …») que ya puede pasar los 140. Se
  armó una tarjeta con una sola compra de 145 caracteres, se pagó, y **sólo cambiarle la categoría**
  desde Movimientos deja Guardar sin efecto — el usuario no tocó la descripción en ningún momento.
- **Por qué:** `description: z.string().max(140).optional()` (`TransactionFormDialog.tsx:41`), y el
  campo Descripción no tiene `error` conectado a `errors.description`
  (`TransactionFormDialog.tsx:394-396`) ni `maxLength` en el input.

### MO-11 · Básico edita «Sueldo» (y cualquier movimiento suelto) — Alto

- **Pasos:** plan Básico → Hoy → «Sueldo» → asignar $50.000 → Movimientos → buscar «Sueldo» → tocar
  la fila.
- **Obtenido:** abre el formulario **completo** de edición (no el desmarcado de un toque que sí
  aplica a un pago de fijo) — con los chips Gasto/Ingreso, categoría, fecha e importe editables.
  Se probó cambiar el tipo a **Gasto** y Guardar: el PATCH se aceptó (204) y, verificado por SQL, el
  movimiento quedó como `expense`.
- **Por qué:** `openEdit` sólo desvía al desmarcado cuando `tx.fixed_expense_payment_id` existe
  (`Movimientos.tsx:240-242`); cualquier otro movimiento — Sueldo, un ajuste, un movimiento suelto de
  antes de bajar de plan — abre el form entero, sin ningún chequeo de plan adicional
  (`Movimientos.tsx:244-246`).
- **Nota:** el README ya decía «Básico (Movimientos)… sólo lectura» — no lo es: además de este caso,
  ver FI-05 (tocar el movimiento de un fijo lo despaga sin confirmar), que sigue vigente.

### MO-12 · Importe en formato inglés se guarda mal, sin aviso — Alto

- **Pasos:** Nuevo movimiento → Importe: `1,234.56` (pensado como mil doscientos treinta y cuatro con
  56) → Guardar.
- **Obtenido:** se guarda como **$1,23** — verificado por SQL (`amount: "1.23"`). Sin ningún error ni
  confirmación.
- **Por qué:** `parseAmountToCents` da por hecho que si hay una coma, es el separador decimal es-AR y
  cualquier punto es de miles (`src/lib/money.ts:55-56`): `"1,234.56"` → saca los puntos → `"1,23456"`
  → cambia la coma por punto → `"1.23456"` → `Number(...)` = 1.23456 → $1,23. Nada en el formulario
  avisa qué formato espera ni muestra una previsualización del monto interpretado.

### MO-13 · «0.500» se interpreta como $500 — Alto

- **Pasos:** Nuevo movimiento → Importe: `0.500` (pensado como cero con cincuenta centavos) → Guardar.
- **Obtenido:** se guarda como **$500,00** — verificado por SQL.
- **Por qué:** sin coma, `parseAmountToCents` trata un punto seguido de exactamente 3 dígitos como
  separador de miles (`src/lib/money.ts:56`, regex `/(?<=\d)\.(?=\d{3}\b)/g`) — `"0.500"` pasa esa
  prueba y el punto se borra, quedando `"0500"` = 500. El mismo problema afecta a cualquier importe
  con 3 decimales que parezca un número redondo de miles.

### MO-14 · Editar por encima del saldo de la cuenta no avisa — Medio

- **Pasos:** movimiento de $500 en la cuenta Efectivo (saldo bajo) → editarlo a $50.000.000 → Guardar.
- **Obtenido:** PATCH aceptado (204), sin ningún aviso de que la cuenta queda muy negativa.
- **Por qué:** a diferencia de las transferencias (que sí frenan el sobregiro,
  `20260920040001_...sql`), un gasto común nunca lo valida. Resuelve el pendiente transversal
  del README («confirmar si es a propósito») — no parece serlo: no hay ningún mensaje ni corte, sólo
  ausencia total de chequeo.

### MO-15 · Sin forma de cargar un movimiento entre 768 y 1023 px — Medio

- **Pasos:** Premium, ventana de 900 px de ancho → Movimientos.
- **Obtenido:** ni la barra de tabs de mobile (con el `+`, oculta desde 768px) ni el botón «Nuevo
  movimiento» (que recién aparece desde 1024px) están visibles. No hay ninguna forma de cargar un
  movimiento suelto en ese rango de anchos — verificado con capturas a 900px.
- **Por qué:** `MobileTabBar` es `md:hidden` (`src/app/MobileTabBar.tsx:61`, `md` = 768px) y «Nuevo
  movimiento» en Movimientos es `hidden lg:block` (`Movimientos.tsx:298`, `lg` = 1024px) — el hueco
  entre los dos breakpoints queda sin ningún punto de entrada.

### MO-16 · Sin fecha mínima ni máxima — Bajo

- **Pasos:** Nuevo movimiento → Fecha: `2030-01-01`, y por separado `0001-01-01` → Guardar en cada
  caso.
- **Obtenido:** las dos se guardan sin aviso — verificado por SQL. El diálogo de pagar un fijo sí
  pone un `max` (hoy); éste no pone ni mínimo ni máximo.
- **Por qué:** `<Input id="occurredOn" type="date" ... />` sin `max`/`min`
  (`TransactionFormDialog.tsx:374`).

### MO-17 · Por API: categoría de otra cuenta en un movimiento propio — Medio

- **Pasos (con la sesión de QA, sobre datos propios):** `INSERT` en `transactions` con `user_id`
  propio pero `category_id` de la cuenta de prueba habitual.
- **Obtenido:** se acepta (201) — verificado en vivo. El movimiento queda con una categoría que la
  cuenta de QA no puede ver ni elegir desde la UI (sale del selector, que sólo lista las propias); el
  peor efecto visible es que esa fila deja de coincidir con el donut de Análisis (misma familia que
  MO-08, una categoría "fuera de lugar" descuadra los totales).
- **Por qué:** la policy de `insert` en `transactions` sólo mira `user_id = auth.uid()`
  (`20260805190003_...sql:18-28`); el FK a `categories` no valida dueño, y nada más lo hace.
- **No es explotable contra otra cuenta:** no se puede leer ni usar la categoría ajena para nada — el
  daño queda contenido en la propia cuenta.

### MO-18 · Por API: `fixed_expense_payment_id` de otra cuenta — Bajo · verificado seguro

- **Pasos (con la sesión de QA):** `INSERT` propio con `fixed_expense_payment_id` de un pago de la
  cuenta de prueba habitual.
- **Obtenido:** se acepta (201) — el `INSERT` no valida el dueño del pago, mismo motivo que MO-17.
- **Por qué no se explota:** borrar ese movimiento dispara el trigger
  `trg_transactions_unmark_fixed_payment`, que intenta `delete from fixed_expense_payments where id =
  old.fixed_expense_payment_id` (`20260916010001_...sql:154-163`) — la función **no** es `security
  definer`, corre con los permisos de quien la invoca, así que ese `delete` queda sujeto a la RLS de
  `fixed_expense_payments` (dueño propio) y no borra nada de la otra cuenta. Verificado leyendo la
  migración; no se ejecutó el borrado en vivo para no arriesgar la fila ajena, pero el movimiento
  propio con el vínculo se creó y se borró después sin ningún efecto detectado en la otra cuenta.

---

## Verificado correcto (no repetir)

- **Seguridad entre cuentas — RLS de `transactions`:** con la sesión de QA, contra la cuenta de
  prueba habitual: `SELECT` por `user_id` o por `id` da 0 filas; `UPDATE`/`DELETE` por `id` afectan 0
  filas; `INSERT` con su `user_id` se rechaza (`new row violates row-level security policy`). Ningún
  vector de lectura o escritura cruzada funcionó.
- **`account_id` ajeno se rechaza:** insertar con la cuenta de otro usuario da `account_not_found`
  (el trigger `transactions_account` sí valida dueño).
- **Planes:**
  - Básico: nav Hoy/Fijos/Movimientos; sin «Nuevo movimiento» ni columna/filtro de Cuenta.
  - Test: nav Hoy/Movimientos/Fijos/Análisis; «Nuevo movimiento» con selector de Cuenta; **sin**
    el chip Compartido (la primera lectura lo daba visible por un falso positivo del selector de
    Playwright, que matcheaba la fila «QA-MO gasto compartido» en vez del chip — confirmado con
    captura que el diálogo de Test sólo tiene Gasto/Ingreso/Cancelar/Guardar).
- **Formulario:**
  - `amount = 0` se rechaza con «Ingresá un importe válido» (no se guarda nada).
  - Un importe de 11 o 12 cifras se rechaza (overflow de `numeric(12,2)`, ya conocido de Fijos).
  - `-500` guarda $500 (el signo se pela a propósito, es intencional por comentario del código).
  - `1.234` (miles es-AR) guarda $1.234 correctamente.
  - `0,005` redondea a $0,01 (esperable, mismo criterio que FI-18).
  - Cambiar Gasto↔Ingreso limpia la categoría elegida.
- **Cierre de cuenta:** la foto final por SQL (perfil, cantidad de movimientos, suma de ingresos y
  gastos, tarjetas, deudas) coincide exacto con la foto inicial.

## Quedó afuera

- **Paginación y exportación:** tamaños de página, tope de 1.000 filas del período, CSV en vivo
  (separador, columnas, nombre de archivo).
- **Ciclos quincenal y semanal en vivo** (con inicio de semana distinto), y el borde horario de las
  21h Argentina con el reloj emulado.
- **Coherencia de caché entre pantallas abiertas** (Análisis/Hoy desactualizados mientras se carga
  desde otra pantalla) — queda como sospecha por lectura de código, no reproducida en vivo esta vez.
- **Layout sistemático de 320 a 1920px** y en modo oscuro (sólo se verificó el hueco de 900px de
  MO-15).
- **Doble click / dos pestañas** sobre Guardar y Eliminar.
- Categorías archivadas/eliminadas y su efecto en el filtro y en filas viejas.
- El resto de los ítems de seguridad de la Parte MO-I no cubiertos arriba (`is_adjustment/
  is_credit_card_payment` seteados a mano por API, `rpc_admin_delete_user` en cascada — este último,
  por decisión, no se ejecuta nunca en una pasada de QA).

## Estado de la cuenta de QA al cerrar

- **Perfil:** Premium, ciclo mensual, semana desde el lunes — igual que al empezar.
- **Datos:** exactamente los mismos que dejó el QA de Fijos (22 movimientos, mismos totales de
  ingresos y gastos, 0 tarjetas, la única deuda pre-existente «Préstamo test QA» sin tocar). Todo lo
  cargado en esta pasada (tarjetas, compras, deudas, ajuste y movimientos de prueba, marcados
  `QA-MO`) se borró al cerrar y se verificó por SQL que no queda ningún resto.
