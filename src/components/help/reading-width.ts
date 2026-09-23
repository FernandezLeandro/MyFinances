/** Ancho máximo de una sección que es para LEER o es una ilustración (la maqueta anotada, la tabla de
 *  acciones): estirada al ancho del shell (hasta 1600px) queda con bandas vacías y renglones
 *  larguísimos. Lo aplica `HelpSection` con `narrow`, que además la centra — el título va adentro, así
 *  que no queda el encabezado a la izquierda y la tarjeta al medio.
 *
 *  Las grillas de tarjetas (pasos, preguntas) no lo llevan: ocupan el ancho de la pantalla como el
 *  resto de la app. */
export const HELP_READING_WIDTH = 'max-w-[900px]'
