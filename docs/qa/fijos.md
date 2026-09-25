# QA de Gastos fijos

- **Código:** rama `accounts`, commit `4bacfa9`, con la migración `20260923050001_hoy_del_cliente`
  aplicada al empezar.
- **Planes:** Premium (casi todo), Básico y Test (lo que cambia por plan).
- **Ciclos:** mensual, quincenal, semanal con inicio lunes y semanal con inicio domingo.

  Con esto no quedó ningún Alto ni Medio abierto salvo el resto de FI-14 (a propósito).

  Plan de cierre de los Bajos y del resto de FI-14 (2026-09-24), guardado en
  `C:\Users\leanf\.claude\plans\armemos-un-plan-para-harmonic-wilkinson.md`:
  - **Bloques A, B y C** (FI-18 a FI-25): resueltos y verificados en vivo el 2026-09-24. Sin migración
    (sólo front). La verificación encontró un bug propio del Bloque A: «Nuevo fijo» crasheaba al abrir
    (`fixedExpenseNameError` con `name` todavía `undefined`); arreglado con test de regresión antes de
    seguir.
  - **Bloque D** (resto de FI-14 + FI-26, hallazgo nuevo): migración
    `20260924010001_fijos_pagos_solo_por_rpc.sql`, aplicada a producción por Lean el 2026-09-24 (el
    modo automático de Claude Code bloqueó el `db push`). FI-14 y FI-26 resueltos y verificados en vivo.

  Con esto **no queda ningún issue abierto en Fijos.**


## Resumen

Lo básico anda bien:
- alta, pago con otra fecha, importe o cuenta, mes pasado, pausa, eliminación y guardado;
- el `+` de Básico;
- el proyectado del período actual cierra al centavo con la base en todos los ciclos;
- la base frena bien el doble pago por carrera: 20 llamadas en paralelo dejan un solo pago;
- ninguna prueba contra otra cuenta pasó.

Los problemas vienen por cuatro lados:
- **El pago y su movimiento se desincronizan** cuando se edita o se borra el movimiento desde Movimientos
  (FI-02, FI-03).
- **Los toques dobles o accidentales:** una bolsa duplica la carga (FI-01), y en Básico un toque en
  Movimientos quita un pago (FI-05).
- **Una semana que cruza de mes** mezcla pagos y cargas de los dos meses (FI-04, FI-06).
- **El proyectado para quien recién arranca:** un fijo nuevo con un día ya pasado resta como atrasado
  (FI-07).

## Hallazgos

| ID | Sev. | Estado | Título |
|---|---|---|---|
| FI-01 | Alto | **Resuelto** (2026-09-23) | Doble toque en «Registrar» de una bolsa duplica la carga |
| FI-02 | Alto | **Resuelto** (2026-09-23) | Editar el movimiento de un pago no actualiza el pago |
| FI-03 | Alto | **Resuelto** (2026-09-23) | Borrar el movimiento de un guardado deja el fijo pagado con plata que no salió |
| FI-04 | Alto | **Resuelto** (2026-09-24) | Semana entre dos meses: un pago del mes anterior marca pagado el siguiente, y quitarlo borra el viejo |
| FI-05 | Alto | **Resuelto** (2026-09-23) | Básico: tocar el movimiento de un fijo en Movimientos quita el pago sin confirmar |
| FI-06 | Alto | **Resuelto** (2026-09-24) | Semana entre dos meses: el panel del proyectado no cierra y las bolsas mezclan períodos |
| FI-07 | Alto | **Resuelto** (2026-09-23) | Un fijo nuevo con día ya pasado aparece atrasado y resta del proyectado |
| FI-08 | Medio | **Resuelto** (2026-09-24) | Períodos futuros: el panel del proyectado no cierra |
| FI-09 | Medio | **Resuelto** (2026-09-24) | Semana que no empieza el lunes: Fijos no reconoce la semana actual |
| FI-10 | Medio | **Resuelto** (2026-09-23) | Quitar un pago no deshace el cambio de importe del fijo |
| FI-11 | Medio | **Resuelto** (2026-09-23) | Doble click en «Marcar pagado»: queda pagado pero sale un error |
| FI-12 | Medio | **Resuelto** (2026-09-23) | Guardar o cargar de más no avisa |
| FI-13 | Medio | **Resuelto** (2026-09-23) | «Disponible» y «Total del mes» usan el importe actual del fijo, no lo pagado |
| FI-14 | Medio | **Resuelto** (2026-09-24) | La base acepta datos inválidos o pagos armados a mano por API |
| FI-15 | Medio | **Resuelto** (2026-09-24) | Bolsas quincenales/semanales: el servidor ubica la carga por fecha UTC |
| FI-16 | Bajo | **Resuelto** (2026-09-23) | Nombre de sólo espacios guarda un fijo sin nombre |
| FI-17 | Bajo | **Resuelto** (2026-09-23) | El error de más de 80 caracteres sale en inglés |
| FI-18 | Bajo | **Resuelto** (2026-09-24) | Importes raros se aceptan en silencio; 11 cifras dan un error genérico |
| FI-19 | Bajo | **Resuelto** (2026-09-24) | Se permiten dos fijos con el mismo nombre |
| FI-20 | Bajo | **Resuelto** (2026-09-24) | «Falta pagar en 28–4 sep» |
| FI-21 | Bajo | **Resuelto** (2026-09-24) | «Pagados esta semana» incluye pagos anteriores del mes |
| FI-22 | Bajo | **Resuelto** (2026-09-24) | Pausar un fijo ya pagado lo saca de los pagados del mes |
| FI-23 | Bajo | **Resuelto** (2026-09-24) | Con la app abierta, pasada la medianoche Fijos sigue en el mes anterior |
| FI-24 | Bajo | **Resuelto** (2026-09-24) | Pagar un fijo ya cubierto por guardados pide igual «Con qué lo pagué» |
| FI-25 | Bajo | **Resuelto** (2026-09-24) | 320 px: encabezados de sección apretados |
| FI-26 | Medio | **Resuelto** (2026-09-24) | Guardado: editar el importe de su movimiento siempre se rechaza (`linked_movement_amount_invalid`) |

---

### FI-01 · Doble toque en «Registrar» de una bolsa duplica la carga — Alto — Resuelto

- **Pasos:** Fijos → bolsa «Súper» → `+` (registrar carga) → $1.500 → doble click en «Registrar».
- **Esperado:** una carga.
- **Obtenido:** dos cargas de $1.500 y dos movimientos. El saldo bajó $3.000, sin ningún aviso.
- **Por qué:** el botón se deshabilita con `isPending` (`MarkPaidDialog.tsx:171`), pero el segundo click
  entra antes del re-render. Además, en la base una bolsa acepta cualquier cantidad de cargas por período,
  a diferencia de «una vez al mes», que tiene índice único (ver FI-11). En el celular un doble toque es
  fácil. Lo mismo puede pasar con «Guardar» (tampoco tiene guardia).
- **Arreglo:** candado síncrono (`useRef`, `MarkPaidDialog.tsx`) que corta cualquier segundo click antes
  del re-render — cubre «Registrar», «Marcar pagado» y «Guardar» con un único cambio, porque los tres
  botones son este mismo diálogo. Se libera en `onSettled` (éxito o error), para no trabar el diálogo si
  la mutación falla.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): doble click (`dblclick`, dos eventos `click`
  sintéticos consecutivos) en «Registrar» de una bolsa de prueba → un solo cargo de $1.500 en la base
  (confirmado por SQL de sólo lectura, no por texto en pantalla — ver «Aprendido» en
  [README](README.md)). Fixture borrado al terminar.

### FI-02 · Editar el movimiento de un pago no actualiza el pago — Alto — Resuelto

Tres variantes, desde Movimientos → tocar el movimiento → editar → Guardar:

| Cambio en el movimiento | Qué quedó |
|---|---|
| Importe $10.000 → $15.000 | El pago sigue en $10.000: Fijos y el historial muestran $10.000, pero salieron $15.000 |
| Tipo Gasto → **Ingreso** ($9.000, pago de agosto) | El fijo sigue «pagado» en agosto, con $9.000 en el historial, y el movimiento ahora **suma** $9.000 al saldo (+$18.000 de diferencia) |
| Una carga de bolsa $1.500 → $5.000 | La bolsa sigue mostrando «$3.000 de $80.000» (debería ser $6.500): el remanente queda inflado y el proyectado mal |

- **Por qué:** `fixed_expense_payments.amount_paid` es una copia que nadie actualiza. El formulario del
  movimiento avisa que borrarlo desmarca el fijo, pero no dice nada al editarlo.
- **Arreglo:** trigger `transactions_sync_linked_fixed_expense` (`before update` en `transactions`,
  migración `20260923070001_fijos_movimiento_vinculado.sql`) suma el delta del importe a
  `fixed_expense_payments.amount_paid` (o a `fixed_expense_savings.amount` si el movimiento es de un
  guardado) y rechaza (`linked_movement_type_locked`) cualquier cambio de tipo Gasto↔Ingreso. El
  formulario (`TransactionFormDialog`) bloquea los chips Gasto/Ingreso cuando el movimiento está
  vinculado (sin `onClick`, no sólo `disabled` visual) y avisa que el importe sincroniza.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): fijo de prueba pagado $20.000 → editado a $25.000
  desde Movimientos → Fijos mostró $25.000 sin recargar; el chip «Ingreso» no es clickeable (confirmado
  por accesibilidad: 0 botones, escopeado al diálogo abierto). Fixture de prueba borrado al terminar, sin
  dejar rastro.

### FI-03 · Borrar el movimiento de un guardado deja el fijo pagado con plata que no salió — Alto — Resuelto

- **Pasos:**
  1. Gimnasio ($30.000): guardar $10.000 y $25.000, los dos con movimiento.
  2. Pagarlo: no genera movimiento, porque ya está cubierto.
  3. Movimientos → «Guardado · Gimnasio» de $25.000 → Eliminar.
- **Obtenido:**
  - se borra al instante, sin confirmar;
  - el guardado se va con el movimiento (`on delete cascade`);
  - Gimnasio sigue «pagado $30.000», pero sólo salieron $10.000;
  - el saldo y el proyectado suben $25.000.
- **Esperado:** el mismo freno que en el detalle del fijo, donde quitar un guardado de un mes ya pagado
  está bloqueado (`fixed_expense_saving_period_paid`), o al menos un aviso.
- **Arreglo:** trigger `transactions_block_delete_paid_saving` (`before delete` en `transactions`,
  misma migración que FI-02) reusa el freno de `rpc_remove_fixed_expense_saving` — si el guardado es de
  un período ya pagado, la base rechaza el `delete`. El formulario pide confirmar primero
  (`RemoveLinkedMovementDialog`, «¿Eliminar este guardado?»); si igual está bloqueado, el toast lo explica
  («Este guardado es de un mes ya pagado: primero quitá el pago del fijo»). `rpc_delete_account` se ajustó
  para no chocar con este freno al borrar una cuenta entera (borra los guardados originales antes de que
  el trigger los vea, después de reinsertar sus copias sin movimiento).
- **Verificado en vivo** (cuenta de QA, 2026-09-23): fijo de prueba $30.000, guardado con movimiento por el
  total, marcado pagado (cubierto, sin movimiento nuevo) → intentar eliminar el movimiento del guardado
  desde Movimientos pidió confirmar y, al confirmar, la base lo rechazó con el mensaje de arriba; el
  movimiento siguió existiendo. De paso se encontró y arregló una promesa sin manejar en la consola del
  navegador cuando la base rechazaba el borrado (mismo patrón que FI-11, ver «Aprendido» en
  [README](README.md)).

### FI-04 · Semana entre dos meses: pago del mes anterior — Alto — Resuelto

- **Pasos:**
  1. Ciclo semanal (lunes).
  2. «QA Dia2» (vence el 2) pagado el 2 de septiembre.
  3. En Fijos, avanzar a la semana 28/9–4/10.
- **Obtenido:**
  - QA Dia2 aparece en «Pagados esta semana» con el pago de **septiembre**. El vencimiento de octubre no
    está pagado, y la base lo sigue restando.
  - Tocar «quitar pago» en esa semana borró el **pago de septiembre** y su movimiento del 2/9.
- **Por qué:** `statusFor` filtra los pagos por fijo pero no por `period` (`aggregate.ts:58-64`): con
  `done = pagos.length > 0`, cualquier pago de cualquiera de los dos meses lo marca hecho, y «quitar»
  toma el primero. Los guardados tienen el mismo filtro.
- **Arreglo (Bloque 4):** `summarizeFixedExpenses` (`aggregate.ts`) arma una instancia por **(fijo,
  mes)**, igual que el cross join `months × fijos` de `rpc_projected_balance_range`, y `statusFor`
  filtra pagos y guardados por `period`. Cada fila lleva `period` (key `fixedExpenseStatusKey`) y,
  si el ciclo toca dos meses, el mes al lado del nombre («QA Dia2 · sep»). `MarkPaidDialog` recibe el
  `period` de la instancia. Sin migración para esta parte.
- **Verificado en vivo** (cuenta de QA, 2026-09-24, ciclo semanal lunes en la semana 28/9–4/10):
  «QA Dia2» aparece dos veces («· sep» y «· oct»). Pagar la de septiembre creó un solo pago con
  `period = 2026-09-01` y octubre siguió pendiente. Con las dos pagadas, «quitar pago» en la de
  septiembre borró sólo ese pago; el de octubre quedó intacto.

### FI-05 · Básico: tocar el movimiento de un fijo lo despaga — Alto — Resuelto

- **Pasos:** plan Básico → Movimientos → tocar el movimiento «Expensas» ($180.000).
- **Obtenido:**
  - el pago se quitó en el acto: el movimiento desaparece y el fijo vuelve a pendiente;
  - no hay confirmación, ni toast, ni «Deshacer»;
  - nada en la fila indica que tocarla hace eso.
- **Por qué:** es a propósito (`Movimientos.tsx:241`), pero para el usuario casual de Básico, un toque al
  pasar el dedo le cambia los números sin que se entere.
- **Arreglo:** el toque abre `RemoveLinkedMovementDialog` («¿Quitar este pago? Se borra este movimiento y
  el fijo vuelve a quedar pendiente.») antes de llamar a `unmarkFixedPayment` — mismo diálogo que reusa el
  botón Eliminar del formulario completo (FI-03). El freno `payment_before_accounts` (pago de antes de
  tener cuentas) sigue siendo un paso aparte, después de confirmar esto.
- **Verificado en vivo** (cuenta de QA, cambiada a Básico por SQL con OK de Lean y devuelta a Premium al
  terminar, 2026-09-23): confirmado que **Fijos** es la misma pantalla completa en los tres planes (crear,
  pagar, editar, pausar y eliminar un fijo) — lo único que cambia por plan es la nav, Movimientos y la
  tarjeta de Hoy (ver «Aprendido» en [README](README.md)). Con un fijo de prueba pagado: tocar su
  movimiento pidió confirmar, «Cancelar» no tocó nada, y confirmar lo desmarcó y lo volvió a pendiente.

### FI-06 · Semana entre dos meses: el panel no cierra — Alto — Resuelto

Misma semana 28/9–4/10:
- **Proyectado:** el panel dice «Saldo actual $1.471.889 · Fijos por pagar (2) −$85.000» y el número grande
  es **$1.101.889**. Faltan $285.000 que no aparecen en ninguna línea. La base resta:
  - Expensas, atrasada de septiembre;
  - las bolsas de **septiembre y de octubre**.

  El cliente, en cambio, no arrastra lo atrasado cuando la semana cruza de mes (`withMonthCarry`).
- **Una bolsa mensual** suma las cargas de los dos meses: «QA BolsaMes $12.000 de $20.000» = $5.000 de
  septiembre + $7.000 de octubre.
- **Una bolsa semanal**, en una semana **futura**, muestra las cargas de la semana actual («Súper $3.000
  de $80.000»). Mientras el mes es el actual, el sub-período se toma de *hoy*, no de la semana que se mira
  (`aggregate.ts:93-102`).
- **Arreglo (Bloque 4):**
  - `withMonthCarry` (`src/lib/cycle.ts`) arrastra siempre hasta el día 1 del mes de `from`, también
    cuando la semana cruza de mes. La base ya lo hacía (`date_trunc('month', p_from)` sin condición):
    el desfase era sólo del cliente.
  - Con las instancias por (fijo, mes) de FI-04, una bolsa tiene un presupuesto propio por cada mes
    que toca la semana, en vez de sumar las cargas de los dos.
  - El tercer punto (bolsa semanal en semana futura) se deja **a propósito** igual que la base: mientras
    el mes sea el actual, el sub-período se toma de hoy. Cambiarlo cambiaría qué resta el proyectado.
- **Verificado en vivo** (2026-09-24, semana 28/9–4/10): «Saldo actual $1.426.889 − Fijos por pagar
  (6) $195.000 = $1.231.889», igual al número grande. «QA BolsaMes» y «Súper» aparecen una vez por
  mes, cada una con su presupuesto ($5.000 y $7.000 de $20.000 por separado).

### FI-07 · Un fijo nuevo con día ya pasado aparece atrasado — Alto — Resuelto

- **Pasos:** el 22/9, cargar un fijo nuevo con vencimiento el día 5.
- **Obtenido:** en septiembre aparece en «Atrasado · Venció el 5» y resta del proyectado, aunque su
  `starts_on` es el 22/9.
- **Impacto:** alguien que carga todos sus fijos a mitad de mes ve el proyectado bajar por todo lo que ya
  pagó ese mes (esa plata ya está fuera de su saldo). Es una decisión de producto: que el primer mes cuente
  sólo desde `starts_on`, o preguntar «¿ya lo pagaste este mes?» al crearlo.
- **Decisión de Lean:** el primer mes cuenta sólo desde `starts_on` — un fijo con vencimiento anterior al
  alta arranca el mes que viene.
- **Arreglo:** `summarizeFixedExpenses` (`aggregate.ts`) excluye un fijo «una vez al mes» cuyo
  vencimiento materializado de ESE mes es anterior a `starts_on` — no cuenta como atrasado, no resta del
  proyectado, y no aparece en ningún lado hasta el mes siguiente. Si ya tiene un pago ese período, no se
  esconde. Espejo en la base: `rpc_projected_balance_range`
  (`20260923080001_fijos_alta_y_deshacer_importe.sql`), aplicada a producción con OK de Lean.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), con datos reales de la 1.ª pasada: «Expensas»
  (vence el 15, `starts_on` 22/9) dejó de aparecer en Fijos de septiembre y de restar del proyectado —
  antes de este arreglo hubiera sumado $180.000 a «Atrasado». El total de «Total del mes» ($837.500) y
  «Falta pagar» ($97.000) que mostró la pantalla coincidieron centavo a centavo con el cálculo hecho
  aparte por SQL de sólo lectura sobre los fijos activos de la cuenta.

### FI-08 · Períodos futuros: el panel no cierra — Medio — Resuelto

- **Pasos:** en Fijos, avanzar a octubre (mensual) o a 1–15 oct / 16–31 oct (quincenal).
- **Obtenido:** en 1–15 oct, «Saldo actual $1.476.889 − Fijos por pagar $955.500» da $521.389, pero el
  número grande es **$244.389**.
- **Por qué:** la diferencia ($277.000) es lo impago del período actual. La base lo resta bien (si no lo
  pagás, a fin de octubre tampoco lo vas a tener), pero el panel no lo muestra en ninguna línea. En el
  período actual, en cambio, el panel cierra al centavo en todos los ciclos.
- **Sugerencia:** una línea «Pendiente de antes».
- **Arreglo (Bloque 4):** función pura `pendingBeforeCents` (`src/lib/projectedBalance.ts`, con test):
  lo que el número grande resta y ninguna línea explica. `SaldoProyectadoPanel` la muestra como
  «Pendiente de antes» sólo si no es 0 (en el período actual siempre da 0). Cableada en Fijos y Mis
  Deudas; Hoy no navega.
- **Verificado en vivo** (2026-09-24, semana 19–25 oct): «Saldo actual $1.426.889 − Fijos por pagar
  $955.500 − Pendiente de antes $97.000 = $374.389», igual al número grande.

### FI-09 · Semana que no empieza el lunes — Medio — Resuelto

- **Pasos:** ciclo semanal que empieza el domingo; semana actual 20–26/9.
- **Obtenido:**
  - no hay grupo «Atrasado»;
  - Expensas y QA Dia2, ya vencidos, aparecen en «Fijos de la semana» como «**Vence** el 15» y «Vence el 2»;
  - «Lo más próximo: Vence el 2».

  Hoy, en cambio, dice «Venció».
- **Por qué:** `isCurrentCycle` fija `weekStartsOn: 1` (`src/lib/cycle.ts:150`).
- **Arreglo (Bloque 4):** `isCurrentCycle` compara hoy contra `[cycle.from, cycle.to]`. Test en
  `cycle.test.ts`.
- **Verificado en vivo** (2026-09-24, semana domingo–sábado 20–26/9, hoy jueves 24): aparece el grupo
  «Atrasado» con «QA Dia2 · Venció el 2».

### FI-10 · Quitar un pago no deshace el cambio de importe — Medio — Resuelto

- **Pasos:**
  1. Pagar «QA Servicio» ($10.000) con $12.345,67. Avisa «El importe del fijo pasa a este valor de acá en
     adelante».
  2. Quitar el pago.
- **Obtenido:** el fijo queda en $12.345,67 y el proyectado resta ese nuevo importe. Si el importe estaba mal
  tipeado, hay que editar el fijo a mano.
- **Relacionado:** pagar un mes **futuro** también cambia el importe del fijo, y eso mueve el total de los
  meses anteriores (FI-13).
- **Arreglo:** columna nueva `fixed_expense_payments.previous_template_amount`
  (`20260923080001_fijos_alta_y_deshacer_importe.sql`). `rpc_mark_fixed_expense_paid` la llena con el
  importe ANTERIOR de la plantilla, sólo cuando el pago la actualiza (mes en curso o futuro).
  `rpc_unmark_fixed_expense_payment` restaura ese importe al desmarcar — pero sólo si la plantilla sigue
  exactamente en lo que puso ese pago (`amount = amount_paid`): si un pago posterior la volvió a cambiar,
  no toca nada (esa edición manda). Los pagos de ANTES de esta migración no tienen este dato (columna
  `null`), así que desmarcarlos no restaura nada — ya era el comportamiento de siempre para ellos.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): fijo de prueba pagado $10.000 → pagado de nuevo con
  $15.000 (plantilla pasó a $15.000) → quitar el pago → la plantilla volvió a $10.000. Fixture borrado al
  terminar.

### FI-11 · Doble click en «Marcar pagado» — Medio — Resuelto

- **Obtenido:**
  - el fijo quedó pagado una sola vez (bien: el segundo intento choca con el índice único, 409);
  - pero aparece el toast rojo «No se pudo marcar como pagado. Probá de nuevo.» y un error sin manejar en
    la consola.

  El mensaje invita a reintentar algo que ya salió bien.
- **Verificado en la base:** 20 llamadas en paralelo a `rpc_mark_fixed_expense_paid` dan 1 pago, 19
  rechazos y ningún movimiento huérfano.
- **Arreglo:** dos capas, la misma raíz que FI-01. (1) El candado del diálogo (ver FI-01) evita que un
  toque normal mande la segunda llamada. (2) Defensa en el servidor: si igual llega un `23505` sobre
  `fixed_expense_payments_single_per_period_idx` (`useMarkFixedExpensePaid`, `api.ts`), se trata como
  éxito — no un error real, el primer intento ya pagó — y se invalida en vez de mostrar el toast rojo
  (`isDuplicateKeyError`, nuevo helper en `src/lib/errors.ts`, con test). De paso se encontró y arregló
  el mismo patrón de promesa sin manejar (`await mutateAsync`) que ya tenía `confirmDelete` en
  `TransactionFormDialog.tsx` (Bloque 1), pero que seguía en su vecino `onDelete` (el camino de un
  movimiento SIN vincular) — mismo arreglo, `.mutate()` en vez de `await mutateAsync()`.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): doble click en «Marcar pagado» de un fijo de prueba
  → un solo pago en la base, sin toast rojo, sin error de consola. Fixture borrado al terminar.

### FI-12 · Guardar o cargar de más no avisa — Medio — Resuelto

- **Guardado:** $10.000 + $25.000 sobre un fijo de $30.000. El diálogo dice «Con esto lo tenés cubierto.» y
  no avisa que sobran $5.000, que salen del saldo igual.
- **Bolsa:** cargar $90.000 cuando quedaban $77.000 dice «Con esta carga completás el presupuesto
  semanal.» En Fijos se ve «+$13.000», pero el diálogo no lo dijo.
- **Arreglo:** función pura `amountAfterCopy` (`aggregate.ts`, con test) decide entre «falta», «exacto» o
  «de más» sumando lo ya guardado/cargado más el importe que se está por confirmar contra el objetivo. El
  diálogo ahora dice «Guardás $X de más.» (guardado) o «Te pasás $X del presupuesto {mensual/quincenal/
  semanal}.» (bolsa) en el caso «de más», en vez del mismo texto que «exacto».
- **Verificado en vivo** (cuenta de QA, 2026-09-23): guardar $35.000 sobre un fijo de $30.000 mostró
  «Guardás $5.000,00 de más.»; cargar de más en una bolsa mostró «Te pasás $1.500,00 del presupuesto
  mensual.» — ambos antes de confirmar, sin tocar la base. Fixtures borrados al terminar.

### FI-13 · «Disponible» y «Total del mes» usan el importe actual — Medio — Resuelto

- **Obtenido:** en Básico, la tarjeta de Hoy muestra «Disponible $1.060.389,50», pero Sueldo − Pagado −
  Falta pagar da $1.061.500,50.
- **Por qué:** «QA Servicio» se pagó $10.000 en septiembre, y después pagar octubre llevó su importe a
  $11.111. El total del ciclo suma el importe **actual** de cada fijo, no lo pagado en ese mes
  (`Hoy.tsx:195-198`). Lo mismo pasa con «Total del mes» en Fijos. Con FI-02 y FI-10 el desfasaje es más
  fácil de provocar.
- **Arreglo:** función pura `cycleTotalCents` (`aggregate.ts`, con test): un fijo de una vez pagado aporta
  lo que de verdad se pagó (`paidCents`), pendiente aporta el importe vigente, y una bolsa aporta lo mayor
  entre el presupuesto y lo cargado. La usan «Total del mes» en Fijos y `totalFixedCents`/«Disponible» en
  Hoy — con esto, Total = Pagado + Falta pagar por construcción.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), con «QA Servicio» real ($10.000 pagado en septiembre,
  plantilla en $11.111 por el pago de octubre — el mismo caso del hallazgo original, sin fabricar nada
  nuevo): «Total del mes» de Fijos mostró $837.500, que coincide centavo a centavo con sumar
  `cycleTotalCents` a mano por SQL de sólo lectura sobre los 7 fijos activos de septiembre (usa los
  $10.000 pagados de «QA Servicio», no los $11.111 de la plantilla actual).

### FI-14 · La base acepta datos inválidos o pagos armados a mano — Medio — Resuelto

Todo esto es por API directa, con la sesión de la cuenta, y **sólo sobre sus propios datos**:
- `fixed_expenses` acepta nombre vacío, nombre de 500 caracteres, «una vez al mes» sin día (se ve «Vence el
  —») y bolsa con día.
- `fixed_expense_payments` acepta insertar pagos sin pasar por la RPC: dos pagos del mismo período
  marcando `is_recurring = true`, y cambiar `amount_paid` a cualquier valor.
- `rpc_mark_fixed_expense_paid` paga un fijo **pausado**, y acepta una fecha futura.
- `rpc_unmark_fixed_expense_payment` con un id que no existe (o de otra cuenta) responde OK sin hacer nada,
  en vez de un error.

**Verificado correcto:**
- la base rechaza importe ≤ 0, overflow, día 0/32, frecuencia inválida y `user_id` ajeno (RLS);
- no se pudo leer, pagar, quitar, guardar, editar ni borrar nada de otra cuenta;
- pagar con una cuenta ajena da `account_not_found`.

**Arreglado (Bloque 5, `20260923090001_fijos_blindaje.sql`):**
- `fixed_expenses` ahora tiene `check` propios: nombre no vacío y ≤80 caracteres
  (`fixed_expenses_name_not_blank`), y `is_recurring` coherente con `due_day`
  (`fixed_expenses_due_day_matches_recurring`) — ya no se puede guardar una bolsa con día ni un fijo de
  una vez sin él.
- `rpc_mark_fixed_expense_paid` rechaza pagar un fijo pausado (`fixed_expense_inactive`) y una fecha
  futura (`fixed_expense_payment_future_date`).
- `rpc_unmark_fixed_expense_payment` con un id que no existe da error (`fixed_expense_payment_not_found`)
  en vez de responder OK sin hacer nada.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), por API directa con la sesión de la cuenta (mismo
  método que encontró el hallazgo): pagar un fijo de prueba pausado → rechazado; pagarlo con una fecha de
  pasado mañana → rechazado; desmarcar un id de pago inventado → rechazado. Los tres con el código de
  error nuevo, no un 200 silencioso. Fixture borrado al terminar.

**Arreglado (Bloque D, 2026-09-24):** `fixed_expense_payments` seguía aceptando un
insert/update directo (sin pasar por la RPC), tal como quedó documentado arriba. Migración
`20260924010001_fijos_pagos_solo_por_rpc.sql`:
- `rpc_mark_fixed_expense_paid`, `rpc_unmark_fixed_expense_payment`, `rpc_add_fixed_expense_saving`,
  `rpc_remove_fixed_expense_saving`, `rpc_delete_account` y el trigger `trg_transactions_sync_linked_
  fixed_expense` (Bloque 1) pasan a `security definer`, con `set search_path = public` y un chequeo de
  `auth.uid() is not null` al principio de cada una — cada una ya filtraba el resto de sus consultas por
  `user_id = auth.uid()`, así que no hacía falta tocar esa parte.
- Se sacan las policies `fixed_expense_payments_insert_own`/`_update_own` y el `insert`/`update` directo
  (`revoke`); en `fixed_expense_savings` se saca `_insert_own` y el `insert` directo. Quedan `select` y
  `delete` en las dos — ningún caso de la UI dependía de un `insert`/`update` directo distinto de la RPC.
- La validación de que `account_id` sea de la propia cuenta no hacía falta agregarla: ya la hace el
  trigger `trg_transactions_account` sobre cualquier insert/update de `transactions`, sea cual sea el
  `security` de la función que lo dispara.
- Aplicada a producción por Lean el 2026-09-24.
- **Verificado en vivo** (cuenta de QA, 2026-09-24, después de la migración), por API directa con la
  sesión de la cuenta:
  - insert directo en `fixed_expense_payments` y en `fixed_expense_savings` → 403 `permission denied`;
    `PATCH amount_paid` de un pago → 403, el importe no cambia;
  - pagar o guardar para un fijo de otra cuenta → sigue rechazado (`fixed_expense_not_found`);
  - el flujo normal sigue andando: marcar pagado y desmarcar (por RPC y desde la pantalla), guardar y
    quitar guardado, editar el importe del movimiento de un pago (FI-02, se sincroniza), borrar el
    movimiento de un pago (lo desmarca) y borrar un fijo pagado;
  - `rpc_delete_account` (ahora definer): eliminar una cuenta con un guardado con movimiento deja el
    guardado, sin movimiento;
  - sin errores de consola salvo los 403 buscados. Fixtures borradas; el saldo volvió a su valor.

### FI-15 · Bolsas quincenales/semanales: carga ubicada por fecha UTC — Medio — Resuelto

- **Evidencia:** una carga hecha el 22/9 a las 23:53 (Argentina) quedó con `paid_at` 2026-09-23 02:53 UTC.
- **Riesgo:** el proyectado ubica la carga en su sub-período con `paid_at::date`, en UTC, y el cliente lo
  hace con la fecha local. Una carga de un domingo después de las 21:00 (o del día 15 en quincenal) caería
  en la semana o quincena **siguiente** para el servidor y en la actual para la pantalla: el número grande
  y el desglose dejarían de coincidir.
- **Por qué no se reprodujo:** no era domingo ni día 15.
- **Relacionado:** `rpc_add_fixed_expense_saving` todavía usa `current_date` (UTC) cuando no recibe fecha.
  Hoy el cliente siempre la manda, así que no se vio en vivo.
- **Arreglo (Bloque 4, `20260923100001_fijos_bolsa_paid_on.sql`):**
  - columna nueva `fixed_expense_payments.paid_on date`: la fecha local que ya arma la RPC (elegida o
    «hoy» del cliente), con backfill desde el movimiento o `paid_at` en hora Argentina;
  - `rpc_mark_fixed_expense_paid` la llena, el trigger del Bloque 1 la sincroniza si se edita la fecha
    del movimiento, y `rpc_projected_balance_range` ubica la carga por `paid_on`;
  - el cliente (`statusFor`) también usa `paid_on`, así que los dos lados miran la misma fecha;
  - `rpc_add_fixed_expense_saving` recibe `p_today` y deja de usar `current_date`.
- **Verificado en vivo** (2026-09-24): el backfill corrió sin errores y el total de «Súper» en la semana
  actual coincide con sus cargas según `paid_on`. El borde real (domingo o día 15 después de las
  21:00) no se reprodujo: no era ese horario.

### FI-26 · Guardado: editar el importe de su movimiento siempre se rechaza — Medio — Resuelto

- **Encontrado por lectura de código** (2026-09-24), al planear el cierre de FI-14: `fixed_expense_
  savings` tiene RLS y nunca tuvo policy de `update` (`20260912030001_fixed_expense_savings.sql`). El
  trigger `trg_transactions_sync_linked_fixed_expense` (Bloque 1, FI-02) sí hace `update public.fixed_
  expense_savings` al editar el importe del movimiento de un guardado, y no era `security definer`.
- **Confirmado en vivo** (cuenta de QA, 2026-09-24, antes de la migración), por API directa con la
  sesión de la cuenta: guardado de $10.000 con movimiento → editar el importe del movimiento a $15.000 →
  la base lo rechaza con `linked_movement_amount_invalid` y el guardado sigue en $10.000. No es un error
  de permiso: bajo RLS sin policy de `update`, el `update` afecta 0 filas sin avisar, y el trigger lo lee
  como importe inválido. FI-02 sólo se había verificado con un pago, no con un guardado.
- **Arreglo:** mismo cambio que el resto de FI-14 (Bloque D) — el trigger pasa a `security definer`, así
  que ya no depende de que `fixed_expense_savings` tenga `grant update` para `authenticated`.
- **Verificado en vivo** (2026-09-24, después de la migración): el mismo guardado, con el importe de su
  movimiento editado a $15.000 → la base lo acepta y el guardado queda en $15.000.

### FI-16 a FI-25 · Bajos

- **FI-16 · Nombre de sólo espacios — Resuelto:**
  - Zod valida `min(1)` antes del `trim` (`FixedExpenseFormDialog.tsx:19,110`), así que «   » se guarda como
    un fijo sin nombre;
  - en la lista es una fila en blanco con el importe.
  - **Arreglo:** el schema pasa a `z.string().trim().min(1, 'Falta el nombre').max(80, 'Máximo 80
    caracteres')` — recorta antes de validar el mínimo. De yapa, la base ahora tiene un `check` propio
    (`fixed_expenses_name_not_blank`, Bloque 5) por si algo la esquiva.
- **FI-17 · Error en inglés — Resuelto:** 81 caracteres muestran «Too big: expected string to have <=80
  characters» (el mensaje por defecto de Zod). El input tampoco tiene `maxLength`.
  - **Arreglo:** mensaje propio en el `.max(80, …)` del schema, más `maxLength={80}` en el `<input>` —
    ahora no se puede ni tipear el carácter 81 (verificado tipeando 90 caracteres: el input corta en
    80). El mensaje en castellano sólo se ve si algo evita el `maxLength` del DOM (ej. un paste raro o
    una API directa contra el schema); se verificó bypaseándolo a mano.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), ambos: nombre «   » → «Falta el nombre», no guarda;
  90 caracteres tipeados → el input queda en 80; forzando 81 caracteres por fuera del `maxLength` →
  «Máximo 80 caracteres», nunca el mensaje en inglés de Zod.
- **FI-18 · Importes — Resuelto:**
  - «-500» se guarda como $500 y «1,2,3» como $1,23, sin avisar;
  - «0,005» redondea a $0,01;
  - con 11 cifras, el toast genérico «No se pudo guardar. Probá de nuevo.» y una promesa rechazada sin
    manejar;
  - 10 cifras funcionan.
  - «1.234» se lee como 1234, lo esperable en es-AR.
  - **Arreglo:** `parseAmountToCents` (`src/lib/money.ts`) rechaza más de una coma («1,2,3») y más de 2
    decimales («0,005») en vez de adivinar. `MAX_AMOUNT_CENTS` (mismo archivo, 1e12, el tope de un
    `numeric(12,2)`) — la reusan el alta y «Marcar pagado»/«Registrar carga»/«Guardar», y `accounts/
    aggregate.ts` (antes tenía dos constantes locales iguales). «-500» sigue igual a propósito:
    `sanitizeAmountInput` ya borra el signo mientras se tipea en un campo sin `allowNegative`. El alta
    pasó de `await mutateAsync` a `.mutate()` (saca la promesa sin manejar). Tests en `money.test.ts` y
    `accounts/aggregate.test.ts` (ya cubierto).
- **FI-19 · Nombres duplicados — Resuelto:** se puede tener dos «Alquiler».
  Cuentas ya lo impide; en Fijos confunde (sobre todo en el buscador del `+` de Básico).
  - **Arreglo:** `fixedExpenseNameError` (`aggregate.ts`), espejo de `accountNameError` pero contra TODOS
    los fijos (activos y pausados, no sólo activos como Cuentas) — uno pausado se puede reactivar. Sólo
    del lado del cliente, sin índice único. Tests en `aggregate.test.ts`.
- **FI-20 · Etiqueta del cruce de mes — Resuelto:** el encabezado de la semana
  28/9–4/10 decía «Falta pagar en **28–4 sep**». El navegador de arriba sí dice «28 sep – 4 oct 2026».
  - **Arreglo:** `cycleShortLabel` (`src/lib/cycle.ts`) pone el mes de cada punta cuando son distintos:
    «28 sep – 4 oct». Test en `cycle.test.ts`.
- **FI-21 · «Pagados esta semana» — Resuelto:** incluía fijos pagados antes en
  el mes (por el arrastre del mes). Por ejemplo, uno pagado el 2/9 figuraba como «pagado esta semana» en
  la del 21–27/9.
  - **Arreglo:** `summarizeFixedExpenses` (`aggregate.ts`) — un atrasado arrastrado por `withMonthCarry`
    sólo se trae para no perder de vista lo que sigue IMPAGO; si ya está pagado, sólo cuenta como «pagado»
    en la ventana que se está mirando si el pago cayó DENTRO de ella (`paid_on >= window.from`) — si se
    pagó en un ciclo anterior, ya se resolvió ahí y no reaparece en éste. Tests en `aggregate.test.ts`.
- **FI-22 · Pausar un fijo ya pagado — Resuelto:** lo sacaba de «Pagados este
  mes» y del «Pagado» del mes, así que la foto del mes cambiaba hacia atrás. El pago y su movimiento
  seguían existiendo.
  - **Decisión de Lean:** un fijo pausado que ya tiene un pago o una carga en el período sigue en
    «Pagados» ese período.
  - **Arreglo:** `summarizeFixedExpenses` ya no descarta los pausados de entrada — una instancia de un
    fijo pausado sólo se queda si tiene pagos/cargas en su período, y queda forzada a `done`/sin resto
    (no hay forma de completar una bolsa pausada a medio cargar). `Fijos.tsx` y `Hoy.tsx` pasan a pedir
    `useFixedExpenses(true)` siempre (antes sólo con el panel «Pausados» abierto). Tests en
    `aggregate.test.ts`.
- **FI-23 · App abierta pasada la medianoche — Resuelto:** con la app abierta a
  las 23:58 del 30/9 y sin recargar, a las 00:02 Fijos seguía mostrando septiembre. El diálogo de pago sí
  tomaba la fecha nueva. Se corregía al navegar.
  - **Arreglo:** hook nuevo `useToday` (`src/lib/useToday.ts`) — programa un `setTimeout` a la próxima
    medianoche local (`msUntilNextDay`, `src/lib/dates.ts`, con test) y revisa también en `focus`/
    `visibilitychange` (una PWA suspendida puede no correr el timer a tiempo). `useCycle` lo usa en vez de
    `useMemo(() => new Date(), [])`; Fijos, Hoy y Mis Deudas lo heredan porque las tres llaman
    `useCycle()`.
- **FI-24 · Pagar un fijo ya cubierto — Resuelto:** el diálogo decía «Ya
  guardaste $35.000 con movimiento: no hace falta generar un movimiento nuevo», pero igual pedía «Con qué
  lo pagué», que no se usaba.
  - **Arreglo:** `MarkPaidDialog` — `showAccountField` también depende de `payTxAmount !== 0` (todo
    cubierto por guardados con movimiento no pide cuenta).
- **FI-25 · 320 px — Resuelto:**
  - con totales de 9 cifras no hay desborde, pero «Gastos fijos» va en dos líneas y los encabezados «Esta
    semana · los próximos 7 días» y «Más adelante · el resto del mes» se parten en tres líneas junto al
    monto;
  - con totales de 11 cifras (irreales) el número grande desborda 18 px a 320 y se sale de su tarjeta a
    1024.
  - **Arreglo:** en `SectionHeader` (`Fijos.tsx`) el título no envuelve y el hint se esconde por debajo
    de `sm`; en el header mobile, `flex-wrap` para que la píldora del ciclo baje si no entra al lado de
    «Gastos fijos». El desborde con 11 cifras no se toca: son montos irreales, y con FI-18 cada fijo ya
    no puede pasar de 10.

**Verificación en vivo de FI-18 a FI-25** (cuenta de QA, 2026-09-24, Playwright contra el dev server
local y la base de producción; fixtures descartables «QA FI2x», todas borradas al terminar y sin
movimientos huérfanos; saldo final igual al de antes, $1.426.889):
- **FI-18:** en «Nuevo fijo», «1,2,3», «0,005» y 14 cifras muestran «Ingresá un importe válido» en el
  campo; 15000 no. Sin toast genérico ni errores de consola.
- **FI-19:** «Alquiler» y «  ALQUILER  » muestran «Ya tenés un fijo con ese nombre.» y dejan «Guardar»
  deshabilitado.
- **FI-20:** con ciclo semanal (lunes), la semana siguiente dice «Falta pagar en 28 sep – 4 oct»; a 320
  px la píldora baja debajo del título, sin scroll horizontal.
- **FI-21:** en la semana 21–27/9, un fijo que vence el 3 y se pagó el 10/9 ya no aparece en «Pagados esta
  semana»; Alquiler e Internet (vencidos el 5 y el 10, pagados el 22/9) sí aparecen. El panel cierra:
  «Saldo actual $1.419.889 − Fijos por pagar $97.000 = $1.322.889».
- **FI-22:** un fijo pagado y después pausado sigue en «Pagados este mes» (también tras recargar), y no
  vuelve a aparecer como pendiente.
- **FI-23:** con `page.clock` a las 23:58 del 30/9, Fijos dice «septiembre»; tras avanzar 4 minutos sin
  recargar, dice «octubre».
- **FI-24:** con un guardado con movimiento que cubre el total, «Marcar como pagado» avisa «Ya
  guardaste… no hace falta generar un movimiento nuevo» y no muestra «Con qué lo pagué» ni ningún
  selector de cuenta.
- **FI-25:** sin scroll horizontal a 320, 375, 1280 y 1920 px. A 320 «Esta semana» entra en una línea
  sin el hint; a 1920 el hint se ve («ya venció», «se cargan durante el período»).

---

## Verificado correcto (no repetir)

- **Alta:** tipo, importe, nombre, categoría opcional y día. La base rechaza los valores inválidos que
  la UI ya frena.
- **Pagar con otro importe, fecha pasada y cuenta:**
  - el movimiento queda en la fecha, la cuenta y la categoría elegidas;
  - el importe del fijo se actualiza sólo en el mes actual o uno futuro;
  - en un mes pasado avisa «el importe del fijo no se toca».
- **Quitar el pago** desde Fijos: borra el movimiento, y el saldo y el proyectado vuelven exactos.
- **Guardado con movimiento que cubre el fijo:** pagar no genera movimiento, y el proyectado no lo resta dos
  veces. Con un guardado con movimiento, Fijos y Hoy cierran al centavo.
- **Pausar y reactivar:** reactivar (desde la fila pausada → detalle → Editar) no duplica nada.
- **Eliminar:** el aviso dice que los movimientos quedan, y es lo que pasa.
- **Historial del detalle y quitar una carga de bolsa.**
- **El proyectado del período actual cierra al centavo** con `rpc_projected_balance_range` en mensual,
  quincenal y semanal (lunes y domingo).
- **La migración «hoy del cliente», en vivo entre las 23:30 y las 23:53, con UTC ya en el día siguiente:**
  - un fijo creado a esa hora queda con `starts_on` del día local;
  - un pago con fecha de hoy guarda `paid_at = now()`;
  - pagar el mes actual con otro importe actualiza el fijo.
- **Básico:**
  - nav con Hoy, Fijos y Movimientos;
  - `+` abre «Registrar en un fijo», con búsqueda que filtra;
  - el pago no ofrece cuenta y va a la predeterminada, en pausa;
  - Hoy muestra la tarjeta de fijos con «Venció».
- **Test:** nav con Análisis y sin Mis Deudas (`/mis-deudas` redirige a Hoy); pagar y guardar ofrecen cuenta.
- **Layout de Fijos y Hoy, de 320 a 1920 px:** con montos de hasta $98 millones por fijo y 24 fijos, no hay
  scroll horizontal ni texto fuera de su tarjeta. Un nombre de 80 caracteres se trunca con «…». El modo
  oscuro se midió con los montos irreales de FI-25 y dio lo mismo que el claro.
- **Seguridad entre cuentas:** ver FI-14.

## Estado de la cuenta de QA al cerrar

- **Perfil:** Premium, ciclo mensual, semana desde el lunes (igual que al empezar).
- **Saldo:** $1.426.889.
- **Datos de esta pasada que siguen cargados:**
  - «QA Servicio», «QA Dia2» y «QA BolsaMes», con sus pagos y cargas;
  - dos cargas de «Súper»;
  - un guardado de $50.000 en Expensas;
  - el movimiento huérfano «Guardado · Gimnasio».
- **Gimnasio** (el fijo del QA de Cuentas) se eliminó en FI-G.
- **Después de los arreglos (Bloques 1-5, hasta 2026-09-24):** la cuenta quedó igual que arriba. Los
  pagos de prueba se quitaron (sin movimientos huérfanos nuevos) y el ciclo volvió a mensual con la
  semana desde el lunes.

## Quedó afuera

- Navegador en otro huso horario (p. ej. UTC+9): a la hora de la prueba coincidía el día con UTC.
- El borde real de FI-15: un domingo, o el 15, después de las 21:00.
- Cambiar la categoría de un fijo con pagos existentes, y pasar de bolsa a «una vez al mes» con cargas del mes
  (candidato: queda «pagado» con cualquier carga, y las filas viejas no frenan un segundo pago).
- El resumen de fijos en Mis Deudas (ver pendientes transversales en [README](README.md)).
- Modo oscuro de los diálogos (sólo se midieron las pantallas).
