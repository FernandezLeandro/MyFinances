/**
 * Grano de fondo. Un near-black plano se lee como plástico; esta capa de ruido muy tenue le da
 * textura sin sumar ni un byte de imagen ni una request.
 */
export function Grain() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-[0.16] mix-blend-soft-light"
    >
      <filter id="saldo-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#saldo-grain)" />
    </svg>
  )
}
