# QA de Gastos fijos

- **Fecha:** 2026-09-22 (22:30) → 2026-09-23 (01:00), hora Argentina. Una parte cayó a propósito entre
  las 21:00 y las 24:00, cuando la fecha UTC ya es el día siguiente.
- **Código:** rama `accounts`, commit `4bacfa9`, con la migración `20260923050001_hoy_del_cliente`
  aplicada al empezar.
- **Planes:** Premium (casi todo), Básico y Test (lo que cambia por plan).
- **Ciclos:** mensual, quincenal, semanal con inicio lunes y semanal con inicio domingo.
- **Pasada:** 1.ª.

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
| FI-01 | Alto | Abierto | Doble toque en «Registrar» de una bolsa duplica la carga |
| FI-02 | Alto | Abierto | Editar el movimiento de un pago no actualiza el pago |
| FI-03 | Alto | Abierto | Borrar el movimiento de un guardado deja el fijo pagado con plata que no salió |
| FI-04 | Alto | Abierto | Semana entre dos meses: un pago del mes anterior marca pagado el siguiente, y quitarlo borra el viejo |
| FI-05 | Alto | Abierto | Básico: tocar el movimiento de un fijo en Movimientos quita el pago sin confirmar |
| FI-06 | Alto | Abierto | Semana entre dos meses: el panel del proyectado no cierra y las bolsas mezclan períodos |
| FI-07 | Alto | Abierto | Un fijo nuevo con día ya pasado aparece atrasado y resta del proyectado |
| FI-08 | Medio | Abierto | Períodos futuros: el panel del proyectado no cierra |
| FI-09 | Medio | Abierto | Semana que no empieza el lunes: Fijos no reconoce la semana actual |
| FI-10 | Medio | Abierto | Quitar un pago no deshace el cambio de importe del fijo |
| FI-11 | Medio | Abierto | Doble click en «Marcar pagado»: queda pagado pero sale un error |
| FI-12 | Medio | Abierto | Guardar o cargar de más no avisa |
| FI-13 | Medio | Abierto | «Disponible» y «Total del mes» usan el importe actual del fijo, no lo pagado |
| FI-14 | Medio | Abierto | La base acepta datos inválidos o pagos armados a mano por API |
| FI-15 | Medio | Por lectura de código | Bolsas quincenales/semanales: el servidor ubica la carga por fecha UTC |
| FI-16 | Bajo | Abierto | Nombre de sólo espacios guarda un fijo sin nombre |
| FI-17 | Bajo | Abierto | El error de más de 80 caracteres sale en inglés |
| FI-18 | Bajo | Abierto | Importes raros se aceptan en silencio; 11 cifras dan un error genérico |
| FI-19 | Bajo | Abierto | Se permiten dos fijos con el mismo nombre |
| FI-20 | Bajo | Abierto | «Falta pagar en 28–4 sep» |
| FI-21 | Bajo | Abierto | «Pagados esta semana» incluye pagos anteriores del mes |
| FI-22 | Bajo | Abierto | Pausar un fijo ya pagado lo saca de los pagados del mes |
| FI-23 | Bajo | Abierto | Con la app abierta, pasada la medianoche Fijos sigue en el mes anterior |
| FI-24 | Bajo | Abierto | Pagar un fijo ya cubierto por guardados pide igual «Con qué lo pagué» |
| FI-25 | Bajo | Abierto | 320 px: encabezados de sección apretados |

---

### FI-01 · Doble toque en «Registrar» de una bolsa duplica la carga — Alto

- **Pasos:** Fijos → bolsa «Súper» → `+` (registrar carga) → $1.500 → doble click en «Registrar».
- **Esperado:** una carga.
- **Obtenido:** dos cargas de $1.500 y dos movimientos. El saldo bajó $3.000, sin ningún aviso.
- **Por qué:** el botón se deshabilita con `isPending` (`MarkPaidDialog.tsx:171`), pero el segundo click
  entra antes del re-render. Además, en la base una bolsa acepta cualquier cantidad de cargas por período,
  a diferencia de «una vez al mes», que tiene índice único (ver FI-11). En el celular un doble toque es
  fácil. Lo mismo puede pasar con «Guardar» (tampoco tiene guardia).

### FI-02 · Editar el movimiento de un pago no actualiza el pago — Alto

Tres variantes, desde Movimientos → tocar el movimiento → editar → Guardar:

| Cambio en el movimiento | Qué quedó |
|---|---|
| Importe $10.000 → $15.000 | El pago sigue en $10.000: Fijos y el historial muestran $10.000, pero salieron $15.000 |
| Tipo Gasto → **Ingreso** ($9.000, pago de agosto) | El fijo sigue «pagado» en agosto, con $9.000 en el historial, y el movimiento ahora **suma** $9.000 al saldo (+$18.000 de diferencia) |
| Una carga de bolsa $1.500 → $5.000 | La bolsa sigue mostrando «$3.000 de $80.000» (debería ser $6.500): el remanente queda inflado y el proyectado mal |

- **Por qué:** `fixed_expense_payments.amount_paid` es una copia que nadie actualiza. El formulario del
  movimiento avisa que borrarlo desmarca el fijo, pero no dice nada al editarlo.

### FI-03 · Borrar el movimiento de un guardado deja el fijo pagado con plata que no salió — Alto

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

### FI-04 · Semana entre dos meses: pago del mes anterior — Alto

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

### FI-05 · Básico: tocar el movimiento de un fijo lo despaga — Alto

- **Pasos:** plan Básico → Movimientos → tocar el movimiento «Expensas» ($180.000).
- **Obtenido:**
  - el pago se quitó en el acto: el movimiento desaparece y el fijo vuelve a pendiente;
  - no hay confirmación, ni toast, ni «Deshacer»;
  - nada en la fila indica que tocarla hace eso.
- **Por qué:** es a propósito (`Movimientos.tsx:241`), pero para el usuario casual de Básico, un toque al
  pasar el dedo le cambia los números sin que se entere.

### FI-06 · Semana entre dos meses: el panel no cierra — Alto

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

### FI-07 · Un fijo nuevo con día ya pasado aparece atrasado — Alto

- **Pasos:** el 22/9, cargar un fijo nuevo con vencimiento el día 5.
- **Obtenido:** en septiembre aparece en «Atrasado · Venció el 5» y resta del proyectado, aunque su
  `starts_on` es el 22/9.
- **Impacto:** alguien que carga todos sus fijos a mitad de mes ve el proyectado bajar por todo lo que ya
  pagó ese mes (esa plata ya está fuera de su saldo). Es una decisión de producto: que el primer mes cuente
  sólo desde `starts_on`, o preguntar «¿ya lo pagaste este mes?» al crearlo.

### FI-08 · Períodos futuros: el panel no cierra — Medio

- **Pasos:** en Fijos, avanzar a octubre (mensual) o a 1–15 oct / 16–31 oct (quincenal).
- **Obtenido:** en 1–15 oct, «Saldo actual $1.476.889 − Fijos por pagar $955.500» da $521.389, pero el
  número grande es **$244.389**.
- **Por qué:** la diferencia ($277.000) es lo impago del período actual. La base lo resta bien (si no lo
  pagás, a fin de octubre tampoco lo vas a tener), pero el panel no lo muestra en ninguna línea. En el
  período actual, en cambio, el panel cierra al centavo en todos los ciclos.
- **Sugerencia:** una línea «Pendiente de antes».

### FI-09 · Semana que no empieza el lunes — Medio

- **Pasos:** ciclo semanal que empieza el domingo; semana actual 20–26/9.
- **Obtenido:**
  - no hay grupo «Atrasado»;
  - Expensas y QA Dia2, ya vencidos, aparecen en «Fijos de la semana» como «**Vence** el 15» y «Vence el 2»;
  - «Lo más próximo: Vence el 2».

  Hoy, en cambio, dice «Venció».
- **Por qué:** `isCurrentCycle` fija `weekStartsOn: 1` (`src/lib/cycle.ts:150`).

### FI-10 · Quitar un pago no deshace el cambio de importe — Medio

- **Pasos:**
  1. Pagar «QA Servicio» ($10.000) con $12.345,67. Avisa «El importe del fijo pasa a este valor de acá en
     adelante».
  2. Quitar el pago.
- **Obtenido:** el fijo queda en $12.345,67 y el proyectado resta ese nuevo importe. Si el importe estaba mal
  tipeado, hay que editar el fijo a mano.
- **Relacionado:** pagar un mes **futuro** también cambia el importe del fijo, y eso mueve el total de los
  meses anteriores (FI-13).

### FI-11 · Doble click en «Marcar pagado» — Medio

- **Obtenido:**
  - el fijo quedó pagado una sola vez (bien: el segundo intento choca con el índice único, 409);
  - pero aparece el toast rojo «No se pudo marcar como pagado. Probá de nuevo.» y un error sin manejar en
    la consola.

  El mensaje invita a reintentar algo que ya salió bien.
- **Verificado en la base:** 20 llamadas en paralelo a `rpc_mark_fixed_expense_paid` dan 1 pago, 19
  rechazos y ningún movimiento huérfano.

### FI-12 · Guardar o cargar de más no avisa — Medio

- **Guardado:** $10.000 + $25.000 sobre un fijo de $30.000. El diálogo dice «Con esto lo tenés cubierto.» y
  no avisa que sobran $5.000, que salen del saldo igual.
- **Bolsa:** cargar $90.000 cuando quedaban $77.000 dice «Con esta carga completás el presupuesto
  semanal.» En Fijos se ve «+$13.000», pero el diálogo no lo dijo.

### FI-13 · «Disponible» y «Total del mes» usan el importe actual — Medio

- **Obtenido:** en Básico, la tarjeta de Hoy muestra «Disponible $1.060.389,50», pero Sueldo − Pagado −
  Falta pagar da $1.061.500,50.
- **Por qué:** «QA Servicio» se pagó $10.000 en septiembre, y después pagar octubre llevó su importe a
  $11.111. El total del ciclo suma el importe **actual** de cada fijo, no lo pagado en ese mes
  (`Hoy.tsx:195-198`). Lo mismo pasa con «Total del mes» en Fijos. Con FI-02 y FI-10 el desfasaje es más
  fácil de provocar.

### FI-14 · La base acepta datos inválidos o pagos armados a mano — Medio

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

### FI-15 · Bolsas quincenales/semanales: carga ubicada por fecha UTC — Medio · por lectura de código

- **Evidencia:** una carga hecha el 22/9 a las 23:53 (Argentina) quedó con `paid_at` 2026-09-23 02:53 UTC.
- **Riesgo:** el proyectado ubica la carga en su sub-período con `paid_at::date`, en UTC, y el cliente lo
  hace con la fecha local. Una carga de un domingo después de las 21:00 (o del día 15 en quincenal) caería
  en la semana o quincena **siguiente** para el servidor y en la actual para la pantalla: el número grande
  y el desglose dejarían de coincidir.
- **Por qué no se reprodujo:** no era domingo ni día 15.
- **Relacionado:** `rpc_add_fixed_expense_saving` todavía usa `current_date` (UTC) cuando no recibe fecha.
  Hoy el cliente siempre la manda, así que no se vio en vivo.

### FI-16 a FI-25 · Bajos

- **FI-16 · Nombre de sólo espacios:**
  - Zod valida `min(1)` antes del `trim` (`FixedExpenseFormDialog.tsx:19,110`), así que «   » se guarda como
    un fijo sin nombre;
  - en la lista es una fila en blanco con el importe.
- **FI-17 · Error en inglés:** 81 caracteres muestran «Too big: expected string to have <=80
  characters» (el mensaje por defecto de Zod). El input tampoco tiene `maxLength`.
- **FI-18 · Importes:**
  - «-500» se guarda como $500 y «1,2,3» como $1,23, sin avisar;
  - «0,005» redondea a $0,01;
  - con 11 cifras, el toast genérico «No se pudo guardar. Probá de nuevo.» y una promesa rechazada sin
    manejar;
  - 10 cifras funcionan.
  - «1.234» se lee como 1234, lo esperable en es-AR.
- **FI-19 · Nombres duplicados:** se puede tener dos «Alquiler». Cuentas ya lo impide; en Fijos
  confunde (sobre todo en el buscador del `+` de Básico).
- **FI-20 · Etiqueta del cruce de mes:** el encabezado de la semana 28/9–4/10 dice «Falta pagar en **28–4
  sep**». El navegador de arriba sí dice «28 sep – 4 oct 2026».
- **FI-21 · «Pagados esta semana»:** incluye fijos pagados antes en el mes (por el arrastre del mes). Por
  ejemplo, uno pagado el 2/9 figura como «pagado esta semana» en la del 21–27/9.
- **FI-22 · Pausar un fijo ya pagado:** lo saca de «Pagados este mes» y del «Pagado» del mes, así que la foto
  del mes cambia hacia atrás. El pago y su movimiento siguen existiendo.
- **FI-23 · App abierta pasada la medianoche:** con la app abierta a las 23:58 del 30/9 y sin recargar,
  a las 00:02 Fijos sigue mostrando septiembre. El diálogo de pago sí toma la fecha nueva. Se corrige al
  navegar.
- **FI-24 · Pagar un fijo ya cubierto:** el diálogo dice «Ya guardaste $35.000 con movimiento: no hace falta
  generar un movimiento nuevo», pero igual pide «Con qué lo pagué», que no se usa.
- **FI-25 · 320 px:**
  - con totales de 9 cifras no hay desborde, pero «Gastos fijos» va en dos líneas y los encabezados «Esta
    semana · los próximos 7 días» y «Más adelante · el resto del mes» se parten en tres líneas junto al
    monto;
  - con totales de 11 cifras (irreales) el número grande desborda 18 px a 320 y se sale de su tarjeta a
    1024.

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

## Quedó afuera

- Navegador en otro huso horario (p. ej. UTC+9): a la hora de la prueba coincidía el día con UTC.
- El borde real de FI-15: un domingo, o el 15, después de las 21:00.
- Cambiar la categoría de un fijo con pagos existentes, y pasar de bolsa a «una vez al mes» con cargas del mes
  (candidato: queda «pagado» con cualquier carga, y las filas viejas no frenan un segundo pago).
- El resumen de fijos en Mis Deudas (ver pendientes transversales en [README](README.md)).
- Modo oscuro de los diálogos (sólo se midieron las pantallas).
