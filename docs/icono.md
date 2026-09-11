# Icono MyFinances — "Anillo partido" (32a)

Dos arcos sobre el cuadro de la marca. Mismo dibujo en claro y oscuro; sólo cambian tres colores.

## Colores

| rol | claro | oscuro |
|---|---|---|
| fondo | `#fbfaf6` (+ borde `#d6d3c8`) | `#16171b` |
| arco acento | `#2b3fd6` | `#2b3fd6` |
| arco neutro | `#a3a5ab` | `#5a5d68` |

## Geometría (viewBox 64×64)

- Cuadro: `rx="15"` (23% — el radio de icono de iOS/Android).
- Arcos: `r="17"`, centro 32,32.
- Acento: 135°, arranca arriba (`rotate(-90)`, `stroke-dasharray="40 67"`).
- Neutro: 199°, arranca en 58° (`stroke-dasharray="59 48"`).
- Grosor: **7** a tamaño grande. En los PNG chicos sube a 9 (32px), 11 (20px) y 13 (16px): con 7 el arco desaparece.

## Archivos

En `public/` quedan sólo 7 (de los 17 que generó la corrida original — el resto era la mitad clara
de los PNG, que no hace falta porque app/PWA van siempre en oscuro, y el `-16.png`/`-bare.svg`/
`-maskable.svg` fuente, redundantes una vez montado):

- `icon-dark.svg` / `icon-light.svg` — icono completo con cuadro. Van de favicon (el claro sólo para
  la pestaña en tema claro del navegador).
- `icon-dark-32.png` — fallback de favicon para navegadores sin soporte de SVG.
- `icon-dark-180.png` — `apple-touch-icon`.
- `icon-dark-192.png` / `icon-dark-512.png` / `icon-maskable-dark-512.png` — manifest de la PWA.

Los `.svg` de acá tienen el bloque `<metadata><c2pa:manifest>` sacado a mano: la corrida original
los generaba con ~8 KB de metadata C2PA por archivo (el dibujo real pesa ~300 bytes), y el SW los
precachea (`globPatterns` en `vite.config.ts`) — dejarlo hubiera sido 24 KB de más por deploy.

Dentro de la app (barra superior, pantalla de login) el símbolo **no** se importa como archivo: es
`src/components/Brand.tsx`, el mismo dibujo pero con `var(--color-accent)`/`var(--color-fg-faint)`
en vez de hex fijos, para seguir el `data-theme` de la app sin un segundo asset por tema.

## Cómo montarlo

```html
<link rel="icon" href="/icon-light.svg" type="image/svg+xml" media="(prefers-color-scheme: light)">
<link rel="icon" href="/icon-dark.svg"  type="image/svg+xml" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/icon-dark-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/icon-dark-180.png">
```

En el manifest:

```json
"icons": [
  { "src": "/icon-dark-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icon-dark-512.png", "sizes": "512x512", "type": "image/png" },
  { "src": "/icon-maskable-dark-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

Notas: el icono de app y el de la PWA van siempre en la versión **oscura**, en los dos temas — un icono de pantalla de inicio no sigue el tema del sistema y el oscuro aguanta cualquier fondo de pantalla. La clara existe para la pestaña del navegador en tema claro, donde el cuadro oscuro pesa demasiado.
