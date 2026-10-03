import { domMax } from 'motion/react'

/** Las funciones de `motion` (animación, `layout`, `layoutId`), en su propio módulo para que
 *  `LazyMotion` las baje en un chunk aparte y no engorden el bundle inicial — ver `App.tsx`. */
export default domMax
