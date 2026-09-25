# QA de Gastos fijos

- **Código:** rama `accounts`, commit `4bacfa9`, migración `20260923050001_hoy_del_cliente`
  aplicada al empezar.
- **Planes:** Premium (casi todo), Básico y Test (lo que cambia por plan).
- **Ciclos:** mensual, quincenal, semanal inicio lunes y semanal inicio domingo.

  Sin Alto ni Medio abierto salvo resto de FI-14 (a propósito).

  Plan cierre Bajos + resto FI-14 (2026-09-24), en
  `C:\Users\leanf\.claude\plans\armemos-un-plan-para-harmonic-wilkinson.md`:
  - **Bloques A, B y C** (FI-18 a FI-25): resueltos y verificados en vivo el 2026-09-24. Sin migración
    (sólo front). La verificación encontró un bug propio del Bloque A: «Nuevo fijo» crasheaba al abrir
    (`fixedExpenseNameError` con `name` todavía `undefined`); arreglado con test de regresión antes de
    seguir.
  - **Bloque D** (resto de FI-14 + FI-26, hallazgo nuevo): migración
    `20260924010001_fijos_pagos_solo_por_rpc.sql`, aplicada a producción por Lean el 2026-09-24 (el
    modo automático de Claude Code bloqueó el `db push`). FI-14 y FI-26 resueltos y verificados en vivo.

  **Ningún issue abierto en Fijos.**


## Resumen

Básico anda bien:
- alta, pago con otra fecha/importe/cuenta, mes pasado, pausa, eliminación, guardado;
- `+` de Básico;
- proyectado del período actual cierra al centavo con base en todos los ciclos;
- base frena doble pago por carrera: 20 llamadas paralelas → un solo pago;
- ninguna prueba contra otra cuenta pasó.

Problemas por cuatro lados:
- **Pago y movimiento se desincronizan** al editar/borrar movimiento desde Movimientos
  (FI-02, FI-03).
- **Toques dobles o accidentales:** bolsa duplica carga (FI-01); en Básico un toque en
  Movimientos quita pago (FI-05).
- **Semana que cruza de mes** mezcla pagos y cargas de ambos meses (FI-04, FI-06).
- **Proyectado para quien recién arranca:** fijo nuevo con día ya pasado resta como atrasado
  (FI-07).

## Hallazgos

| ID | Sev. | Estado | Título |
|---|---|---|---|
| FI-01 | Alto | **Resuelto** (2026-09-23) | Doble toque en «Registrar» de bolsa duplica carga |
| FI-02 | Alto | **Resuelto** (2026-09-23) | Editar movimiento de pago no actualiza pago |
| FI-03 | Alto | **Resuelto** (2026-09-23) | Borrar movimiento de guardado deja fijo pagado con plata que no salió |
| FI-04 | Alto | **Resuelto** (2026-09-24) | Semana entre dos meses: pago mes anterior marca pagado el siguiente; quitarlo borra el viejo |
| FI-05 | Alto | **Resuelto** (2026-09-23) | Básico: tocar movimiento de fijo en Movimientos quita pago sin confirmar |
| FI-06 | Alto | **Resuelto** (2026-09-24) | Semana entre dos meses: panel del proyectado no cierra, bolsas mezclan períodos |
| FI-07 | Alto | **Resuelto** (2026-09-23) | Fijo nuevo con día ya pasado aparece atrasado y resta del proyectado |
| FI-08 | Medio | **Resuelto** (2026-09-24) | Períodos futuros: panel del proyectado no cierra |
| FI-09 | Medio | **Resuelto** (2026-09-24) | Semana que no empieza lunes: Fijos no reconoce semana actual |
| FI-10 | Medio | **Resuelto** (2026-09-23) | Quitar pago no deshace cambio de importe del fijo |
| FI-11 | Medio | **Resuelto** (2026-09-23) | Doble click en «Marcar pagado»: queda pagado pero sale error |
| FI-12 | Medio | **Resuelto** (2026-09-23) | Guardar o cargar de más no avisa |
| FI-13 | Medio | **Resuelto** (2026-09-23) | «Disponible» y «Total del mes» usan importe actual del fijo, no lo pagado |
| FI-14 | Medio | **Resuelto** (2026-09-24) | Base acepta datos inválidos o pagos armados a mano por API |
| FI-15 | Medio | **Resuelto** (2026-09-24) | Bolsas quincenales/semanales: servidor ubica carga por fecha UTC |
| FI-16 | Bajo | **Resuelto** (2026-09-23) | Nombre de sólo espacios guarda fijo sin nombre |
| FI-17 | Bajo | **Resuelto** (2026-09-23) | Error de >80 caracteres sale en inglés |
| FI-18 | Bajo | **Resuelto** (2026-09-24) | Importes raros aceptados en silencio; 11 cifras dan error genérico |
| FI-19 | Bajo | **Resuelto** (2026-09-24) | Se permiten dos fijos con mismo nombre |
| FI-20 | Bajo | **Resuelto** (2026-09-24) | «Falta pagar en 28–4 sep» |
| FI-21 | Bajo | **Resuelto** (2026-09-24) | «Pagados esta semana» incluye pagos anteriores del mes |
| FI-22 | Bajo | **Resuelto** (2026-09-24) | Pausar fijo ya pagado lo saca de pagados del mes |
| FI-23 | Bajo | **Resuelto** (2026-09-24) | App abierta pasada medianoche: Fijos sigue en mes anterior |
| FI-24 | Bajo | **Resuelto** (2026-09-24) | Pagar fijo ya cubierto por guardados pide igual «Con qué lo pagué» |
| FI-25 | Bajo | **Resuelto** (2026-09-24) | 320 px: encabezados de sección apretados |
| FI-26 | Medio | **Resuelto** (2026-09-24) | Guardado: editar importe de su movimiento siempre se rechaza (`linked_movement_amount_invalid`) |

---

### FI-01 · Doble toque en «Registrar» de una bolsa duplica la carga — Alto — Resuelto

- **Pasos:** Fijos → bolsa «Súper» → `+` (registrar carga) → $1.500 → doble click en «Registrar».
- **Esperado:** una carga.
- **Obtenido:** dos cargas de $1.500 y dos movimientos. Saldo bajó $3.000, sin aviso.
- **Por qué:** botón se deshabilita con `isPending` (`MarkPaidDialog.tsx:171`), pero segundo click
  entra antes del re-render. Además, en base una bolsa acepta cargas ilimitadas por período,
  a diferencia de «una vez al mes», que tiene índice único (ver FI-11). En celular doble toque es
  fácil. Igual con «Guardar» (sin guardia).
- **Arreglo:** candado síncrono (`useRef`, `MarkPaidDialog.tsx`) corta segundo click antes
  del re-render — cubre «Registrar», «Marcar pagado» y «Guardar» con un cambio, porque los tres
  son el mismo diálogo. Se libera en `onSettled` (éxito o error), para no trabar diálogo si
  mutación falla.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): doble click (`dblclick`, dos eventos `click`
  sintéticos consecutivos) en «Registrar» de bolsa de prueba → un solo cargo de $1.500 en base
  (confirmado por SQL sólo lectura, no por texto en pantalla — ver «Aprendido» en
  [README](README.md)). Fixture borrado al terminar.

### FI-02 · Editar el movimiento de un pago no actualiza el pago — Alto — Resuelto

Tres variantes, desde Movimientos → tocar movimiento → editar → Guardar:

| Cambio en el movimiento | Qué quedó |
|---|---|
| Importe $10.000 → $15.000 | Pago sigue en $10.000: Fijos e historial muestran $10.000, pero salieron $15.000 |
| Tipo Gasto → **Ingreso** ($9.000, pago de agosto) | Fijo sigue «pagado» en agosto, $9.000 en historial, y movimiento ahora **suma** $9.000 al saldo (+$18.000 de diferencia) |
| Carga de bolsa $1.500 → $5.000 | Bolsa sigue en «$3.000 de $80.000» (debería $6.500): remanente inflado, proyectado mal |

- **Por qué:** `fixed_expense_payments.amount_paid` es copia que nadie actualiza. Formulario del
  movimiento avisa que borrarlo desmarca el fijo, pero nada al editarlo.
- **Arreglo:** trigger `transactions_sync_linked_fixed_expense` (`before update` en `transactions`,
  migración `20260923070001_fijos_movimiento_vinculado.sql`) suma delta del importe a
  `fixed_expense_payments.amount_paid` (o a `fixed_expense_savings.amount` si movimiento es de
  guardado) y rechaza (`linked_movement_type_locked`) cambio de tipo Gasto↔Ingreso. Formulario
  (`TransactionFormDialog`) bloquea chips Gasto/Ingreso si movimiento vinculado (sin `onClick`, no
  sólo `disabled` visual) y avisa que importe sincroniza.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): fijo de prueba pagado $20.000 → editado a $25.000
  desde Movimientos → Fijos mostró $25.000 sin recargar; chip «Ingreso» no clickeable (confirmado
  por accesibilidad: 0 botones, escopeado al diálogo abierto). Fixture borrado, sin rastro.

### FI-03 · Borrar el movimiento de un guardado deja el fijo pagado con plata que no salió — Alto — Resuelto

- **Pasos:**
  1. Gimnasio ($30.000): guardar $10.000 y $25.000, ambos con movimiento.
  2. Pagarlo: no genera movimiento, ya cubierto.
  3. Movimientos → «Guardado · Gimnasio» de $25.000 → Eliminar.
- **Obtenido:**
  - se borra al instante, sin confirmar;
  - guardado se va con movimiento (`on delete cascade`);
  - Gimnasio sigue «pagado $30.000», pero sólo salieron $10.000;
  - saldo y proyectado suben $25.000.
- **Esperado:** mismo freno que en detalle del fijo, donde quitar guardado de mes ya pagado
  está bloqueado (`fixed_expense_saving_period_paid`), o al menos aviso.
- **Arreglo:** trigger `transactions_block_delete_paid_saving` (`before delete` en `transactions`,
  misma migración que FI-02) reusa freno de `rpc_remove_fixed_expense_saving` — si guardado es de
  período ya pagado, base rechaza `delete`. Formulario pide confirmar primero
  (`RemoveLinkedMovementDialog`, «¿Eliminar este guardado?»); si bloqueado, toast explica
  («Este guardado es de un mes ya pagado: primero quitá el pago del fijo»). `rpc_delete_account` ajustado
  para no chocar con freno al borrar cuenta entera (borra guardados originales antes de que
  trigger los vea, tras reinsertar copias sin movimiento).
- **Verificado en vivo** (cuenta de QA, 2026-09-23): fijo de prueba $30.000, guardado con movimiento por
  total, marcado pagado (cubierto, sin movimiento nuevo) → eliminar movimiento del guardado desde
  Movimientos pidió confirmar; al confirmar, base rechazó con mensaje de arriba; movimiento siguió
  existiendo. De paso se arregló promesa sin manejar en consola cuando base rechazaba borrado
  (mismo patrón que FI-11, ver «Aprendido» en [README](README.md)).

### FI-04 · Semana entre dos meses: pago del mes anterior — Alto — Resuelto

- **Pasos:**
  1. Ciclo semanal (lunes).
  2. «QA Dia2» (vence el 2) pagado el 2 de septiembre.
  3. En Fijos, avanzar a semana 28/9–4/10.
- **Obtenido:**
  - QA Dia2 aparece en «Pagados esta semana» con el pago de **septiembre**. El vencimiento de octubre no
    está pagado, y la base lo sigue restando.
  - «quitar pago» en esa semana borró **pago de septiembre** y su movimiento del 2/9.
- **Por qué:** `statusFor` filtra pagos por fijo pero no por `period` (`aggregate.ts:58-64`): con
  `done = pagos.length > 0`, cualquier pago de cualquiera de los dos meses lo marca hecho, y «quitar»
  toma el primero. Guardados, mismo filtro.
- **Arreglo (Bloque 4):** `summarizeFixedExpenses` (`aggregate.ts`) arma instancia por **(fijo,
  mes)**, igual que cross join `months × fijos` de `rpc_projected_balance_range`, y `statusFor`
  filtra pagos y guardados por `period`. Cada fila lleva `period` (key `fixedExpenseStatusKey`) y,
  si ciclo toca dos meses, mes junto al nombre («QA Dia2 · sep»). `MarkPaidDialog` recibe
  `period` de la instancia. Sin migración.
- **Verificado en vivo** (cuenta de QA, 2026-09-24, semanal lunes, semana 28/9–4/10):
  «QA Dia2» aparece dos veces («· sep» y «· oct»). Pagar septiembre creó un pago con
  `period = 2026-09-01`; octubre siguió pendiente. Con ambas pagadas, «quitar pago» en
  septiembre borró sólo ese; octubre intacto.

### FI-05 · Básico: tocar el movimiento de un fijo lo despaga — Alto — Resuelto

- **Pasos:** Básico → Movimientos → tocar movimiento «Expensas» ($180.000).
- **Obtenido:**
  - pago quitado en el acto: movimiento desaparece, fijo vuelve a pendiente;
  - sin confirmación, toast ni «Deshacer»;
  - nada en la fila indica eso.
- **Por qué:** a propósito (`Movimientos.tsx:241`), pero para usuario casual de Básico, un toque al
  pasar el dedo cambia números sin enterarse.
- **Arreglo:** toque abre `RemoveLinkedMovementDialog` («¿Quitar este pago? Se borra este movimiento y
  el fijo vuelve a quedar pendiente.») antes de `unmarkFixedPayment` — mismo diálogo que reusa
  botón Eliminar del formulario completo (FI-03). Freno `payment_before_accounts` (pago de antes de
  tener cuentas) sigue paso aparte, tras confirmar.
- **Verificado en vivo** (cuenta de QA, pasada a Básico por SQL con OK de Lean y devuelta a Premium,
  2026-09-23): confirmado que **Fijos** es misma pantalla completa en los tres planes (crear,
  pagar, editar, pausar, eliminar) — por plan sólo cambian nav, Movimientos y tarjeta de Hoy (ver
  «Aprendido» en [README](README.md)). Fijo de prueba pagado: tocar movimiento pidió confirmar,
  «Cancelar» no tocó nada, confirmar lo desmarcó a pendiente.

### FI-06 · Semana entre dos meses: el panel no cierra — Alto — Resuelto

Misma semana 28/9–4/10:
- **Proyectado:** panel dice «Saldo actual $1.471.889 · Fijos por pagar (2) −$85.000» y número grande
  es **$1.101.889**. Faltan $285.000 sin línea. Base resta:
  - Expensas, atrasada de septiembre;
  - bolsas de **septiembre y octubre**.

  Cliente no arrastra atrasado cuando semana cruza de mes (`withMonthCarry`).
- **Bolsa mensual** suma cargas de ambos meses: «QA BolsaMes $12.000 de $20.000» = $5.000
  sep + $7.000 oct.
- **Bolsa semanal**, en semana **futura**, muestra cargas de semana actual («Súper $3.000
  de $80.000»). Con mes actual, sub-período se toma de *hoy*, no de semana mirada
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

- **Pasos:** el 22/9, cargar fijo nuevo con vencimiento día 5.
- **Obtenido:** en septiembre aparece en «Atrasado · Venció el 5» y resta del proyectado, aunque
  `starts_on` es 22/9.
- **Impacto:** quien carga todos sus fijos a mitad de mes ve proyectado bajar por todo lo ya
  pagado ese mes (plata ya fuera del saldo). Decisión de producto: primer mes cuenta
  sólo desde `starts_on`, o preguntar «¿ya lo pagaste este mes?» al crearlo.
- **Decisión de Lean:** primer mes cuenta sólo desde `starts_on` — fijo con vencimiento anterior al
  alta arranca mes siguiente.
- **Arreglo:** `summarizeFixedExpenses` (`aggregate.ts`) excluye fijo «una vez al mes» cuyo
  vencimiento materializado de ESE mes es anterior a `starts_on` — no atrasado, no resta del
  proyectado, no aparece hasta mes siguiente. Si ya tiene pago ese período, no se
  esconde. Espejo en base: `rpc_projected_balance_range`
  (`20260923080001_fijos_alta_y_deshacer_importe.sql`), aplicada a producción con OK de Lean.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), datos reales de 1.ª pasada: «Expensas»
  (vence 15, `starts_on` 22/9) dejó de aparecer en Fijos de septiembre y de restar del proyectado —
  antes hubiera sumado $180.000 a «Atrasado». «Total del mes» ($837.500) y «Falta pagar» ($97.000)
  coincidieron al centavo con cálculo aparte por SQL sólo lectura sobre fijos activos de la cuenta.

### FI-08 · Períodos futuros: el panel no cierra — Medio — Resuelto

- **Pasos:** en Fijos, avanzar a octubre (mensual) o 1–15 oct / 16–31 oct (quincenal).
- **Obtenido:** en 1–15 oct, «Saldo actual $1.476.889 − Fijos por pagar $955.500» da $521.389, pero
  número grande es **$244.389**.
- **Por qué:** diferencia ($277.000) = impago del período actual. Base lo resta bien (si no lo
  pagás, a fin de octubre tampoco lo tenés), pero panel no lo muestra en ninguna línea. En
  período actual panel cierra al centavo en todos los ciclos.
- **Sugerencia:** línea «Pendiente de antes».
- **Arreglo (Bloque 4):** función pura `pendingBeforeCents` (`src/lib/projectedBalance.ts`, con test):
  lo que número grande resta y ninguna línea explica. `SaldoProyectadoPanel` la muestra como
  «Pendiente de antes» sólo si ≠ 0 (período actual siempre 0). Cableada en Fijos y Mis
  Deudas; Hoy no navega.
- **Verificado en vivo** (2026-09-24, semana 19–25 oct): «Saldo actual $1.426.889 − Fijos por pagar
  $955.500 − Pendiente de antes $97.000 = $374.389», igual al número grande.

### FI-09 · Semana que no empieza el lunes — Medio — Resuelto

- **Pasos:** ciclo semanal desde domingo; semana actual 20–26/9.
- **Obtenido:**
  - sin grupo «Atrasado»;
  - Expensas y QA Dia2, ya vencidos, en «Fijos de la semana» como «**Vence** el 15» y «Vence el 2»;
  - «Lo más próximo: Vence el 2».

  Hoy, en cambio, dice «Venció».
- **Por qué:** `isCurrentCycle` fija `weekStartsOn: 1` (`src/lib/cycle.ts:150`).
- **Arreglo (Bloque 4):** `isCurrentCycle` compara hoy contra `[cycle.from, cycle.to]`. Test en
  `cycle.test.ts`.
- **Verificado en vivo** (2026-09-24, semana domingo–sábado 20–26/9, hoy jueves 24): aparece grupo
  «Atrasado» con «QA Dia2 · Venció el 2».

### FI-10 · Quitar un pago no deshace el cambio de importe — Medio — Resuelto

- **Pasos:**
  1. Pagar «QA Servicio» ($10.000) con $12.345,67. Avisa «El importe del fijo pasa a este valor de acá en
     adelante».
  2. Quitar pago.
- **Obtenido:** fijo queda en $12.345,67 y proyectado resta ese importe. Si estaba mal
  tipeado, hay que editar fijo a mano.
- **Relacionado:** pagar mes **futuro** también cambia importe del fijo, y mueve total de
  meses anteriores (FI-13).
- **Arreglo:** columna nueva `fixed_expense_payments.previous_template_amount`
  (`20260923080001_fijos_alta_y_deshacer_importe.sql`). `rpc_mark_fixed_expense_paid` la llena con
  importe ANTERIOR de plantilla, sólo si pago la actualiza (mes en curso o futuro).
  `rpc_unmark_fixed_expense_payment` restaura ese importe al desmarcar — sólo si plantilla sigue
  exactamente en lo que puso ese pago (`amount = amount_paid`): si pago posterior la cambió,
  no toca nada (esa edición manda). Pagos de ANTES de la migración no tienen dato (columna
  `null`), desmarcarlos no restaura nada — comportamiento de siempre.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): fijo de prueba pagado $10.000 → pagado de nuevo con
  $15.000 (plantilla a $15.000) → quitar pago → plantilla volvió a $10.000. Fixture borrado.

### FI-11 · Doble click en «Marcar pagado» — Medio — Resuelto

- **Obtenido:**
  - fijo pagado una sola vez (bien: segundo intento choca con índice único, 409);
  - pero aparece el toast rojo «No se pudo marcar como pagado. Probá de nuevo.» y un error sin manejar en
    la consola.

  Mensaje invita a reintentar algo ya exitoso.
- **Verificado en la base:** 20 llamadas paralelas a `rpc_mark_fixed_expense_paid` → 1 pago, 19
  rechazos, ningún movimiento huérfano.
- **Arreglo:** dos capas, misma raíz que FI-01. (1) Candado del diálogo (ver FI-01) evita que toque
  normal mande segunda llamada. (2) Defensa servidor: si llega `23505` sobre
  `fixed_expense_payments_single_per_period_idx` (`useMarkFixedExpensePaid`, `api.ts`), se trata como
  éxito — primer intento ya pagó — y se invalida en vez de toast rojo
  (`isDuplicateKeyError`, helper nuevo en `src/lib/errors.ts`, con test). De paso se arregló
  mismo patrón de promesa sin manejar (`await mutateAsync`) que ya tenía `confirmDelete` en
  `TransactionFormDialog.tsx` (Bloque 1), pero seguía en vecino `onDelete` (camino de
  movimiento SIN vincular) — mismo arreglo, `.mutate()` en vez de `await mutateAsync()`.
- **Verificado en vivo** (cuenta de QA, 2026-09-23): doble click en «Marcar pagado» de fijo de prueba
  → un pago en base, sin toast rojo, sin error de consola. Fixture borrado.

### FI-12 · Guardar o cargar de más no avisa — Medio — Resuelto

- **Guardado:** $10.000 + $25.000 sobre fijo de $30.000. Diálogo dice «Con esto lo tenés cubierto.» y
  no avisa que sobran $5.000, que salen del saldo igual.
- **Bolsa:** cargar $90.000 quedando $77.000 dice «Con esta carga completás el presupuesto
  semanal.» Fijos muestra «+$13.000», diálogo no lo dijo.
- **Arreglo:** función pura `amountAfterCopy` (`aggregate.ts`, con test) decide «falta», «exacto» o
  «de más» sumando lo ya guardado/cargado + importe a confirmar contra objetivo. Diálogo
  ahora dice «Guardás $X de más.» (guardado) o «Te pasás $X del presupuesto {mensual/quincenal/
  semanal}.» (bolsa) en caso «de más», en vez del texto de «exacto».
- **Verificado en vivo** (cuenta de QA, 2026-09-23): guardar $35.000 sobre fijo de $30.000 mostró
  «Guardás $5.000,00 de más.»; cargar de más en bolsa mostró «Te pasás $1.500,00 del presupuesto
  mensual.» — ambos antes de confirmar, sin tocar base. Fixtures borrados.

### FI-13 · «Disponible» y «Total del mes» usan el importe actual — Medio — Resuelto

- **Obtenido:** en Básico, tarjeta de Hoy muestra «Disponible $1.060.389,50», pero Sueldo − Pagado −
  Falta pagar da $1.061.500,50.
- **Por qué:** «QA Servicio» se pagó $10.000 en septiembre; pagar octubre llevó su importe a
  $11.111. Total del ciclo suma importe **actual** de cada fijo, no lo pagado ese mes
  (`Hoy.tsx:195-198`). Igual «Total del mes» en Fijos. Con FI-02 y FI-10 desfasaje más
  fácil de provocar.
- **Arreglo:** función pura `cycleTotalCents` (`aggregate.ts`, con test): fijo de una vez pagado aporta
  lo realmente pagado (`paidCents`), pendiente aporta importe vigente, bolsa aporta mayor
  entre presupuesto y cargado. La usan «Total del mes» en Fijos y `totalFixedCents`/«Disponible» en
  Hoy — Total = Pagado + Falta pagar por construcción.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), con «QA Servicio» real ($10.000 pagado en septiembre,
  plantilla en $11.111 por pago de octubre — mismo caso del hallazgo, sin fabricar nada):
  «Total del mes» de Fijos mostró $837.500, coincide al centavo con sumar
  `cycleTotalCents` a mano por SQL sólo lectura sobre los 7 fijos activos de septiembre (usa
  $10.000 pagados, no $11.111 de plantilla).

### FI-14 · La base acepta datos inválidos o pagos armados a mano — Medio — Resuelto

Todo por API directa, con sesión de la cuenta, **sólo sobre sus propios datos**:
- `fixed_expenses` acepta nombre vacío, nombre de 500 caracteres, «una vez al mes» sin día (se ve «Vence el
  —») y bolsa con día.
- `fixed_expense_payments` acepta insertar pagos sin RPC: dos pagos del mismo período
  con `is_recurring = true`, y cambiar `amount_paid` a cualquier valor.
- `rpc_mark_fixed_expense_paid` paga fijo **pausado** y acepta fecha futura.
- `rpc_unmark_fixed_expense_payment` con id inexistente (o de otra cuenta) responde OK sin hacer nada,
  en vez de error.

**Verificado correcto:**
- base rechaza importe ≤ 0, overflow, día 0/32, frecuencia inválida y `user_id` ajeno (RLS);
- no se pudo leer, pagar, quitar, guardar, editar ni borrar nada de otra cuenta;
- pagar con cuenta ajena da `account_not_found`.

**Arreglado (Bloque 5, `20260923090001_fijos_blindaje.sql`):**
- `fixed_expenses` tiene `check` propios: nombre no vacío y ≤80 caracteres
  (`fixed_expenses_name_not_blank`), y `is_recurring` coherente con `due_day`
  (`fixed_expenses_due_day_matches_recurring`) — no se puede guardar bolsa con día ni fijo de
  una vez sin él.
- `rpc_mark_fixed_expense_paid` rechaza pagar fijo pausado (`fixed_expense_inactive`) y fecha
  futura (`fixed_expense_payment_future_date`).
- `rpc_unmark_fixed_expense_payment` con id inexistente da error (`fixed_expense_payment_not_found`)
  en vez de OK silencioso.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), por API directa con sesión de la cuenta (mismo
  método del hallazgo): pagar fijo de prueba pausado → rechazado; pagarlo con fecha de
  pasado mañana → rechazado; desmarcar id inventado → rechazado. Los tres con código de
  error nuevo, no 200 silencioso. Fixture borrado.

**Arreglado (Bloque D, 2026-09-24):** `fixed_expense_payments` seguía aceptando
insert/update directo (sin RPC), como documentado arriba. Migración
`20260924010001_fijos_pagos_solo_por_rpc.sql`:
- `rpc_mark_fixed_expense_paid`, `rpc_unmark_fixed_expense_payment`, `rpc_add_fixed_expense_saving`,
  `rpc_remove_fixed_expense_saving`, `rpc_delete_account` y el trigger `trg_transactions_sync_linked_
  fixed_expense` (Bloque 1) pasan a `security definer`, con `set search_path = public` y chequeo
  `auth.uid() is not null` al principio de cada una — cada una ya filtraba sus consultas por
  `user_id = auth.uid()`, no hizo falta tocar eso.
- Se sacan policies `fixed_expense_payments_insert_own`/`_update_own` y `insert`/`update` directo
  (`revoke`); en `fixed_expense_savings` se saca `_insert_own` y `insert` directo. Quedan `select` y
  `delete` en ambas — ningún caso de UI dependía de `insert`/`update` directo distinto de RPC.
- Validación de que `account_id` sea propia no hizo falta: ya la hace trigger
  `trg_transactions_account` sobre cualquier insert/update de `transactions`, sea cual sea el
  `security` de la función que lo dispara.
- Aplicada a producción por Lean el 2026-09-24.
- **Verificado en vivo** (cuenta de QA, 2026-09-24, post-migración), por API directa con
  sesión de la cuenta:
  - insert directo en `fixed_expense_payments` y en `fixed_expense_savings` → 403 `permission denied`;
    `PATCH amount_paid` de un pago → 403, el importe no cambia;
  - pagar o guardar para fijo de otra cuenta → sigue rechazado (`fixed_expense_not_found`);
  - el flujo normal sigue andando: marcar pagado y desmarcar (por RPC y desde la pantalla), guardar y
    quitar guardado, editar el importe del movimiento de un pago (FI-02, se sincroniza), borrar el
    movimiento de un pago (lo desmarca) y borrar un fijo pagado;
  - `rpc_delete_account` (ahora definer): eliminar una cuenta con un guardado con movimiento deja el
    guardado, sin movimiento;
  - sin errores de consola salvo 403 buscados. Fixtures borradas; saldo volvió a su valor.

### FI-15 · Bolsas quincenales/semanales: carga ubicada por fecha UTC — Medio — Resuelto

- **Evidencia:** carga del 22/9 a las 23:53 (Argentina) quedó con `paid_at` 2026-09-23 02:53 UTC.
- **Riesgo:** proyectado ubica carga en sub-período con `paid_at::date`, en UTC; cliente usa
  fecha local. Carga de domingo después de 21:00 (o día 15 en quincenal) caería en semana
  o quincena **siguiente** para servidor y actual para pantalla: número grande y desglose
  dejarían de coincidir.
- **Por qué no se reprodujo:** no era domingo ni día 15.
- **Relacionado:** `rpc_add_fixed_expense_saving` todavía usa `current_date` (UTC) sin fecha recibida.
  Cliente siempre la manda, no se vio en vivo.
- **Arreglo (Bloque 4, `20260923100001_fijos_bolsa_paid_on.sql`):**
  - columna nueva `fixed_expense_payments.paid_on date`: la fecha local que ya arma la RPC (elegida o
    «hoy» del cliente), con backfill desde el movimiento o `paid_at` en hora Argentina;
  - `rpc_mark_fixed_expense_paid` la llena, el trigger del Bloque 1 la sincroniza si se edita la fecha
    del movimiento, y `rpc_projected_balance_range` ubica la carga por `paid_on`;
  - cliente (`statusFor`) también usa `paid_on`, ambos lados miran misma fecha;
  - `rpc_add_fixed_expense_saving` recibe `p_today` y deja `current_date`.
- **Verificado en vivo** (2026-09-24): backfill sin errores; total de «Súper» en semana
  actual coincide con cargas según `paid_on`. Borde real (domingo o día 15 después de
  21:00) no reproducido: no era ese horario.

### FI-26 · Guardado: editar el importe de su movimiento siempre se rechaza — Medio — Resuelto

- **Encontrado por lectura de código** (2026-09-24), al planear cierre de FI-14: `fixed_expense_
  savings` tiene RLS y nunca tuvo policy de `update` (`20260912030001_fixed_expense_savings.sql`).
  Trigger `trg_transactions_sync_linked_fixed_expense` (Bloque 1, FI-02) sí hace `update public.fixed_
  expense_savings` al editar importe del movimiento de guardado, y no era `security definer`.
- **Confirmado en vivo** (cuenta de QA, 2026-09-24, pre-migración), por API directa con
  sesión de la cuenta: guardado $10.000 con movimiento → editar importe del movimiento a $15.000 →
  base rechaza con `linked_movement_amount_invalid`, guardado sigue en $10.000. No es error
  de permiso: bajo RLS sin policy de `update`, `update` afecta 0 filas en silencio, y trigger lo lee
  como importe inválido. FI-02 sólo verificado con pago, no con guardado.
- **Arreglo:** mismo cambio que resto de FI-14 (Bloque D) — trigger pasa a `security definer`,
  ya no depende de que `fixed_expense_savings` tenga `grant update` para `authenticated`.
- **Verificado en vivo** (2026-09-24, post-migración): mismo guardado, importe de su
  movimiento editado a $15.000 → base acepta, guardado queda en $15.000.

### FI-16 a FI-25 · Bajos

- **FI-16 · Nombre de sólo espacios — Resuelto:**
  - Zod valida `min(1)` antes del `trim` (`FixedExpenseFormDialog.tsx:19,110`), así que «   » se guarda como
    un fijo sin nombre;
  - en lista es fila en blanco con importe.
  - **Arreglo:** el schema pasa a `z.string().trim().min(1, 'Falta el nombre').max(80, 'Máximo 80
    caracteres')` — recorta antes de validar el mínimo. De yapa, la base ahora tiene un `check` propio
    (`fixed_expenses_name_not_blank`, Bloque 5) por si algo la esquiva.
- **FI-17 · Error en inglés — Resuelto:** 81 caracteres muestran «Too big: expected string to have <=80
  characters» (mensaje default de Zod). Input sin `maxLength`.
  - **Arreglo:** mensaje propio en el `.max(80, …)` del schema, más `maxLength={80}` en el `<input>` —
    ahora no se puede ni tipear el carácter 81 (verificado tipeando 90 caracteres: el input corta en
    80). El mensaje en castellano sólo se ve si algo evita el `maxLength` del DOM (ej. un paste raro o
    una API directa contra el schema); se verificó bypaseándolo a mano.
- **Verificado en vivo** (cuenta de QA, 2026-09-23), ambos: nombre «   » → «Falta el nombre», no guarda;
  90 caracteres tipeados → input queda en 80; forzando 81 por fuera del `maxLength` →
  «Máximo 80 caracteres», nunca mensaje en inglés de Zod.
- **FI-18 · Importes — Resuelto:**
  - «-500» se guarda como $500 y «1,2,3» como $1,23, sin avisar;
  - «0,005» redondea a $0,01;
  - con 11 cifras, el toast genérico «No se pudo guardar. Probá de nuevo.» y una promesa rechazada sin
    manejar;
  - 10 cifras funcionan.
  - «1.234» se lee 1234, esperable en es-AR.
  - **Arreglo:** `parseAmountToCents` (`src/lib/money.ts`) rechaza más de una coma («1,2,3») y más de 2
    decimales («0,005») en vez de adivinar. `MAX_AMOUNT_CENTS` (mismo archivo, 1e12, el tope de un
    `numeric(12,2)`) — la reusan el alta y «Marcar pagado»/«Registrar carga»/«Guardar», y `accounts/
    aggregate.ts` (antes tenía dos constantes locales iguales). «-500» sigue igual a propósito:
    `sanitizeAmountInput` ya borra el signo mientras se tipea en un campo sin `allowNegative`. El alta
    pasó de `await mutateAsync` a `.mutate()` (saca la promesa sin manejar). Tests en `money.test.ts` y
    `accounts/aggregate.test.ts` (ya cubierto).
- **FI-19 · Nombres duplicados — Resuelto:** se pueden tener dos «Alquiler».
  Cuentas ya lo impide; en Fijos confunde (sobre todo en buscador del `+` de Básico).
  - **Arreglo:** `fixedExpenseNameError` (`aggregate.ts`), espejo de `accountNameError` pero contra TODOS
    los fijos (activos y pausados, no sólo activos como Cuentas) — uno pausado se puede reactivar. Sólo
    del lado del cliente, sin índice único. Tests en `aggregate.test.ts`.
- **FI-20 · Etiqueta del cruce de mes — Resuelto:** encabezado de semana
  28/9–4/10 decía «Falta pagar en **28–4 sep**». Navegador de arriba sí dice «28 sep – 4 oct 2026».
  - **Arreglo:** `cycleShortLabel` (`src/lib/cycle.ts`) pone el mes de cada punta cuando son distintos:
    «28 sep – 4 oct». Test en `cycle.test.ts`.
- **FI-21 · «Pagados esta semana» — Resuelto:** incluía fijos pagados antes en
  el mes (por arrastre del mes). Ej: uno pagado el 2/9 figuraba «pagado esta semana» en
  la del 21–27/9.
  - **Arreglo:** `summarizeFixedExpenses` (`aggregate.ts`) — un atrasado arrastrado por `withMonthCarry`
    sólo se trae para no perder de vista lo que sigue IMPAGO; si ya está pagado, sólo cuenta como «pagado»
    en la ventana que se está mirando si el pago cayó DENTRO de ella (`paid_on >= window.from`) — si se
    pagó en un ciclo anterior, ya se resolvió ahí y no reaparece en éste. Tests en `aggregate.test.ts`.
- **FI-22 · Pausar un fijo ya pagado — Resuelto:** lo sacaba de «Pagados este
  mes» y del «Pagado» del mes; foto del mes cambiaba hacia atrás. Pago y movimiento
  seguían existiendo.
  - **Decisión de Lean:** un fijo pausado que ya tiene un pago o una carga en el período sigue en
    «Pagados» ese período.
  - **Arreglo:** `summarizeFixedExpenses` ya no descarta los pausados de entrada — una instancia de un
    fijo pausado sólo se queda si tiene pagos/cargas en su período, y queda forzada a `done`/sin resto
    (no hay forma de completar una bolsa pausada a medio cargar). `Fijos.tsx` y `Hoy.tsx` pasan a pedir
    `useFixedExpenses(true)` siempre (antes sólo con el panel «Pausados» abierto). Tests en
    `aggregate.test.ts`.
- **FI-23 · App abierta pasada la medianoche — Resuelto:** app abierta a
  23:58 del 30/9 sin recargar, a 00:02 Fijos seguía en septiembre. Diálogo de pago sí
  tomaba fecha nueva. Se corregía al navegar.
  - **Arreglo:** hook nuevo `useToday` (`src/lib/useToday.ts`) — programa un `setTimeout` a la próxima
    medianoche local (`msUntilNextDay`, `src/lib/dates.ts`, con test) y revisa también en `focus`/
    `visibilitychange` (una PWA suspendida puede no correr el timer a tiempo). `useCycle` lo usa en vez de
    `useMemo(() => new Date(), [])`; Fijos, Hoy y Mis Deudas lo heredan porque las tres llaman
    `useCycle()`.
- **FI-24 · Pagar un fijo ya cubierto — Resuelto:** diálogo decía «Ya
  guardaste $35.000 con movimiento: no hace falta generar un movimiento nuevo», pero igual pedía «Con qué
  lo pagué», sin uso.
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

**Verificación en vivo de FI-18 a FI-25** (cuenta de QA, 2026-09-24, Playwright contra dev server
local y base de producción; fixtures descartables «QA FI2x», todas borradas, sin
movimientos huérfanos; saldo final igual al previo, $1.426.889):
- **FI-18:** en «Nuevo fijo», «1,2,3», «0,005» y 14 cifras muestran «Ingresá un importe válido» en
  campo; 15000 no. Sin toast genérico ni errores de consola.
- **FI-19:** «Alquiler» y «  ALQUILER  » muestran «Ya tenés un fijo con ese nombre.» y dejan «Guardar»
  deshabilitado.
- **FI-20:** ciclo semanal (lunes), semana siguiente dice «Falta pagar en 28 sep – 4 oct»; a 320
  px píldora baja debajo del título, sin scroll horizontal.
- **FI-21:** en semana 21–27/9, fijo que vence el 3 pagado el 10/9 ya no aparece en «Pagados esta
  semana»; Alquiler e Internet (vencidos 5 y 10, pagados 22/9) sí. Panel cierra:
  «Saldo actual $1.419.889 − Fijos por pagar $97.000 = $1.322.889».
- **FI-22:** fijo pagado y luego pausado sigue en «Pagados este mes» (también tras recargar), y no
  vuelve como pendiente.
- **FI-23:** con `page.clock` a 23:58 del 30/9, Fijos dice «septiembre»; tras avanzar 4 minutos sin
  recargar, «octubre».
- **FI-24:** guardado con movimiento que cubre total, «Marcar como pagado» avisa «Ya
  guardaste… no hace falta generar un movimiento nuevo» y no muestra «Con qué lo pagué» ni
  selector de cuenta.
- **FI-25:** sin scroll horizontal a 320, 375, 1280 y 1920 px. A 320 «Esta semana» en una línea
  sin hint; a 1920 hint visible («ya venció», «se cargan durante el período»).

---

## Verificado correcto (no repetir)

- **Alta:** tipo, importe, nombre, categoría opcional y día. Base rechaza inválidos que
  UI ya frena.
- **Pagar con otro importe, fecha pasada y cuenta:**
  - movimiento queda en fecha, cuenta y categoría elegidas;
  - importe del fijo se actualiza sólo en mes actual o futuro;
  - en mes pasado avisa «el importe del fijo no se toca».
- **Quitar pago** desde Fijos: borra movimiento; saldo y proyectado vuelven exactos.
- **Guardado con movimiento que cubre el fijo:** pagar no genera movimiento, proyectado no lo resta dos
  veces. Con guardado con movimiento, Fijos y Hoy cierran al centavo.
- **Pausar y reactivar:** reactivar (fila pausada → detalle → Editar) no duplica nada.
- **Eliminar:** aviso dice que movimientos quedan, y es lo que pasa.
- **Historial del detalle y quitar carga de bolsa.**
- **Proyectado del período actual cierra al centavo** con `rpc_projected_balance_range` en mensual,
  quincenal y semanal (lunes y domingo).
- **Migración «hoy del cliente», en vivo entre 23:30 y 23:53, con UTC ya en día siguiente:**
  - fijo creado a esa hora queda con `starts_on` del día local;
  - pago con fecha de hoy guarda `paid_at = now()`;
  - pagar mes actual con otro importe actualiza fijo.
- **Básico:**
  - nav con Hoy, Fijos y Movimientos;
  - `+` abre «Registrar en un fijo», con búsqueda que filtra;
  - pago no ofrece cuenta, va a la predeterminada, en pausa;
  - Hoy muestra tarjeta de fijos con «Venció».
- **Test:** nav con Análisis, sin Mis Deudas (`/mis-deudas` redirige a Hoy); pagar y guardar ofrecen cuenta.
- **Layout de Fijos y Hoy, 320 a 1920 px:** montos hasta $98 millones por fijo y 24 fijos, sin
  scroll horizontal ni texto fuera de tarjeta. Nombre de 80 caracteres se trunca con «…». Modo
  oscuro medido con montos irreales de FI-25, igual que claro.
- **Seguridad entre cuentas:** ver FI-14.

## Estado de la cuenta de QA al cerrar

- **Perfil:** Premium, ciclo mensual, semana desde lunes (igual que al empezar).
- **Saldo:** $1.426.889.
- **Datos de esta pasada aún cargados:**
  - «QA Servicio», «QA Dia2» y «QA BolsaMes», con pagos y cargas;
  - dos cargas de «Súper»;
  - guardado de $50.000 en Expensas;
  - movimiento huérfano «Guardado · Gimnasio».
- **Gimnasio** (fijo del QA de Cuentas) eliminado en FI-G.
- **Tras arreglos (Bloques 1-5, hasta 2026-09-24):** cuenta igual que arriba. Pagos de prueba
  quitados (sin huérfanos nuevos); ciclo volvió a mensual con semana desde lunes.

## Quedó afuera

- Navegador en otro huso (p. ej. UTC+9): a la hora de la prueba día coincidía con UTC.
- Borde real de FI-15: domingo, o día 15, después de 21:00.
- Cambiar categoría de fijo con pagos existentes, y pasar de bolsa a «una vez al mes» con cargas del mes
  (candidato: queda «pagado» con cualquier carga, y filas viejas no frenan segundo pago).
- Resumen de fijos en Mis Deudas (ver pendientes transversales en [README](README.md)).
- Modo oscuro de diálogos (sólo se midieron pantallas).