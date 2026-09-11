# Handoff: Rediseño visual de MyFinances

## Overview
Nuevo sistema visual para la app de finanzas personales MyFinances (repo `FernandezLeandro/MyFinances`), aplicado a las 6 pantallas principales: Hoy, Movimientos, Fijos, Análisis, Ahorros y Me Deben. Incluye modo claro y modo oscuro (la app hoy no tiene dark mode; se agrega como funcionalidad nueva).

## About the Design Files
Los archivos HTML de este paquete (`Pantalla Principal.dc.html`, `Pantallas.dc.html`) son **referencias de diseño**, no código para copiar. Son maquetas construidas en HTML/CSS para mostrar look & feel, layout y jerarquía. La tarea es **recrear este diseño en el código real de MyFinances** (React + TypeScript, con los componentes y páginas ya existentes: `src/pages/*.tsx`, `src/components/*.tsx`, `src/styles/theme.css`), no insertar el HTML tal cual.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografías, tamaños y layout son finales. Recrear pixel a pixel usando los componentes de React existentes del proyecto, reemplazando sus estilos actuales por los de este sistema.

## Dirección elegida: "Bento claro" (id 3a) + su versión oscura (id 4a)
Layout tipo bento (tarjetas independientes en grilla), navegación superior, un solo color de acento (azul tinta), tipografía Sora para números/títulos y Plus Jakarta Sans para el resto. El modo oscuro usa la misma estructura con superficies oscuras y el acento aclarado para mantener contraste.

## Design Tokens

### Tipografía
- Familia principal (UI, texto): **Plus Jakarta Sans** (400, 500, 600, 800)
- Familia de cifras y títulos: **Sora** (400, 600, 700)
- Import: `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;800&family=Sora:wght@400;600;700`
- Cifras siempre con `font-variant-numeric: tabular-nums`
- Escala: saldo hero 62–64px/700, cifras de tarjeta 22–30px/600–700, cuerpo 13–14px/400–600, labels 11–12px uppercase/letter-spacing 0.1–0.12em/600 color secundario

### Color — Modo claro
- Fondo de app: `#f1f0ec` (o `#efeee8` en pantallas internas)
- Superficie de tarjeta / header: `#fffdf8` → usado `#fbfaf6`
- Texto principal: `#14161a` / `#16171b`
- Texto secundario: `#5b5e66` / `#63656d`
- Texto terciario / labels: `#8b8e96` / `#82848c`
- Bordes: `#e4e2dc` / `#d6d3c8` / `#eceae4` / `#eeece4`
- Acento único (CTA, links, positivo): azul tinta `#2b3fd6` (variantes `#2b3fd7`/`#2b3fd8` según uso), fondo suave `#e7e9fb`
- Negativo / gasto: rojo `#c4402a`
- Bloque de énfasis oscuro (proyectado a fin de mes): fondo `#14161a`/`#16171d`, texto `#f4f4f2`/`#fbfaf7`

### Color — Modo oscuro
- Fondo de app: `#0f1014`
- Superficie de tarjeta: `#191b21`
- Header/nav: `#14161b`
- Texto principal: `#f1f0ec`
- Texto secundario: `#a5a7b0`
- Texto terciario / labels: `#8b8d96`
- Bordes: `#23252c` / `#24262e` / `#33363f`
- Acento único: `#7e8cff` (texto/acentos), botón sólido `#4f5eeb`, fondo suave `#23264a`
- Negativo / gasto: `#ff8f75`
- Bloque de énfasis (proyectado): fondo `#22253a`, texto `#f1f0f6`

### Espaciado y forma
- Radios: 8px (chips/botones pequeños), 10px (botones), 16–20px (tarjetas), 42px (marco mobile)
- Padding de tarjeta: 20–30px según tamaño
- Gap entre tarjetas del bento: 16–18px
- Sombra de contenedor principal: `0 30px 70px -40px rgba(0,0,0,0.7)` (claro) / `rgba(0,0,0,0.9)` (oscuro)

## Navegación
Barra superior fija: logo "MyFinances" (Sora 700) + tabs en pill (Hoy, Movimientos, Fijos, Análisis, Ahorros, Me Deben) — tab activa con fondo sólido (`#16171d` claro / `#262932` oscuro) y texto invertido — selector de mes a la derecha + avatar circular con iniciales.
En mobile: sin barra superior, tab bar inferior con 4 secciones + botón central "+" flotante (color de acento) para Nuevo movimiento.

## Screens / Views

### 1. Hoy (Home) — `src/pages/Hoy.tsx`
**Propósito:** vista principal, saldo del día y salud del mes.
**Layout:** grid bento 3 columnas × 2 filas dentro del área de contenido:
- Celda grande (col 1, ambas filas): tarjeta "Saldo actual" — label + badge de variación ("+18% vs. agosto"), cifra hero, barra de "Flujo del mes" (ingresos vs. gastos, 2 segmentos), fila de Ingresos/Gastos del mes, y al pie los botones **"+ Nuevo movimiento"** (sólido, acento) y **"Cuadrar saldo"** (outline) — ambos juntos, pegados a la tarjeta de saldo (no en el header).
- Celda superior derecha 1: tarjeta oscura "Proyectado a fin de mes" con desglose Fijos por pagar (16) / Deudas por pagar (1) / Fijos pagados (8 de 24).
- Celda superior derecha 2: tarjeta "Ahorros" con total + lista de sub-ítems (Dólares, Emergencia, Viaje, Me deben).
- Fila inferior (span 2 columnas): "Últimos movimientos" agrupados por Hoy/Ayer, fila = punto de color por categoría + nombre + subtítulo + monto con signo.
**Nota de ajuste ya validada:** el botón de nuevo movimiento NO va en el header; va junto a "Cuadrar saldo" dentro de la tarjeta de saldo. No mostrar "Último ajuste: fecha" (se sacó por no ser relevante).
**Mobile:** una columna, tarjeta de saldo arriba (con barra + ingresos/gastos), tarjeta oscura de proyectado, tarjeta de últimos movimientos con scroll, tab bar inferior.

### 2. Movimientos — `src/pages/Movimientos.tsx`, `src/components/TransactionRow.tsx`
**Propósito:** listado completo, filtrable y buscable.
**Layout:** header con navegación de mes (‹ Septiembre 2026 ›) + título; a la derecha botones "Exportar CSV", "Categorías" y CTA "+ Nuevo movimiento". Debajo, barra de búsqueda + botón "Filtros" con badge de cantidad activa + chips de filtros aplicados (con ✕ para quitar) + "Limpiar todo". Cuerpo: tarjetas agrupadas por día, header de grupo = fecha + total neto del día, filas de movimiento debajo (checkbox de selección, punto de categoría, nombre, subtítulo método/categoría, monto).

### 3. Fijos — `src/pages/Fijos.tsx`, `src/components/SaldoProyectadoPanel.tsx`
**Propósito:** gastos recurrentes del mes + impacto en el saldo proyectado.
**Layout:** header con nav de mes, título "Gastos fijos", sub-tabs (Fijos / Mis deudas / Me deben) y CTA "+ Nuevo fijo". Cuerpo en 2 columnas: izquierda, lista "Del mes" con recurrentes primero (checkbox, punto de categoría, nombre, barra de progreso + "$X de $Y" para bolsas variables, o "Vence el N" para fijos de monto fijo, monto a la derecha) y acordeón "Pagados (8)" al final; derecha, tarjeta oscura de "Saldo proyectado a fin de mes" con desglose (saldo actual, fijos por pagar, deudas por pagar) y debajo tarjeta clara "Fijos pendientes" (lista compacta punto+nombre+día+monto).

### 4. Análisis — `src/pages/Analisis.tsx`
**Propósito:** de dónde sale la plata y cómo evoluciona en el tiempo.
**Layout:** header con nav de mes + selector de rango en pills (Mes/Trimestre/Año/Personalizado). Fila 1: tarjeta "En qué se fue la plata" (donut chart + leyenda con % y montos por categoría) junto a tarjeta "Top categorías vs. período anterior" (barras dobles: período actual vs. anterior, con variación %). Fila 2 (ocupa todo el ancho): "Evolución mensual" — gráfico de barras dobles (ingresos/gastos) de 12 meses, mes actual resaltado.

### 5. Ahorros — `src/pages/Ahorros.tsx`
**Propósito:** dinero guardado, separado del flujo mensual.
**Layout:** header con título + descripción ("no afecta a Hoy ni a Análisis") + CTA "+ Nuevo ítem". Cuerpo en 2 columnas: izquierda, tarjeta "Total de Ahorros" con toggle ARS/USD + cifra hero, debajo grid 2×2 de tarjetas por ítem (Dólares, Fondo de emergencia, Viaje 2027, Jubilación —esta última con badge "No cuenta en el total"—, cada una con historial + botón "Nuevo aporte"); derecha, tarjeta "Composición" con barra de proporción ARS/USD, total invertido y ganancia estimada.

### 6. Me Deben — `src/pages/MeDeben.tsx`
**Propósito:** dinero que terceros deben, separado del saldo.
**Layout:** header con título + sub-tabs (Fijos/Mis deudas/Me deben) + CTA "+ Nueva deuda". Cuerpo en 2 columnas: izquierda, tarjeta "Te deben en total" con desglose (cuenta en tu saldo / ya cargado como gasto / vencidas) y nota "no suma al saldo proyectado" + acordeón "Cobradas (3)"; derecha, tarjeta "Pendientes" agrupada por mes esperado de cobro, cada fila con nombre, estado (badge "Descontado", texto de vencimiento en rojo, o "$X de $Y abonado" para pagos parciales), monto y botón de agregar abono.

## Interactions & Behavior
- Botones "+ Nuevo movimiento" / "+ Nuevo fijo" / "+ Nueva deuda" / "+ Nuevo ítem": abren formulario modal (comportamiento ya existente en la app, solo cambia el estilo visual del botón/CTA).
- Chips de filtro: click en ✕ remueve el filtro individual; "Limpiar todo" resetea todos.
- Acordeones ("Pagados", "Cobradas"): expand/collapse, colapsados por defecto.
- Tabs de sección (Fijos/Mis deudas/Me deben) y de rango (Mes/Trimestre/Año): cambian el contenido de la pantalla, un solo tab activo a la vez.
- Toggle ARS/USD en Ahorros: cambia la moneda de visualización del total.
- Selector de mes (‹ ›): navega el período mostrado en Movimientos, Fijos y Análisis.
- Hover: tarjetas y botones no tienen elevación agresiva; usar un leve cambio de opacidad/fondo (no se definieron valores específicos, mantener sutil).

## State Management
No se modifica el estado ni la lógica de datos existentes — este handoff es solo de estilo/layout. Se agrega:
- Un flag de tema (claro/oscuro) persistido (ej. localStorage + preferencia del sistema), aplicado como variable global (theme provider o clase en `<html>`) que resuelve a los tokens de color de arriba.
- Estado de filtros activos en Movimientos (ya debería existir; solo se agrega la UI de chips).

## Screenshots
Carpeta `screenshots/` — capturas de referencia de las maquetas:
- `01-hoy-claro.png` — Hoy, modo claro (desktop + mobile)
- `02-hoy-oscuro.png` — Hoy, modo oscuro (desktop + mobile)
- `03-movimientos.png` — Movimientos (claro a la izquierda, oscuro a la derecha)
- `04-fijos.png` — Gastos fijos (claro / oscuro)
- `05-analisis.png` — Análisis (claro / oscuro)
- `06-ahorros.png` — Ahorros (claro / oscuro)
- `07-me-deben.png` — Me Deben (claro / oscuro)

## Assets
No se usan imágenes ni iconos personalizados — todo son formas CSS (puntos de color por categoría, flechas de texto simples, barras/donuts con `conic-gradient`). Si se quiere reemplazar los iconos de flecha/back por un set de iconos real, usar el que ya tenga la app o Lucide/Heroicons.

## Files
- `Pantalla Principal.dc.html` — pantalla Hoy: variantes exploradas (1a–1d, 2a–2d, 3a/3b) y la versión final elegida con id **3a** (claro) y **4a** (oscuro), desktop + mobile.
- `Pantallas.dc.html` — Movimientos, Fijos, Análisis, Ahorros y Me Deben, cada una en claro y oscuro, siguiendo el sistema de 3a/4a.

Abrir estos HTML en un navegador para ver el diseño en vivo (son autocontenidos).
