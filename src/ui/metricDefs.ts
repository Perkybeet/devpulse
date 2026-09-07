/**
 * Definición única de cada métrica. La interfaz nunca muestra un número sin
 * poder explicar qué mide, cómo se calcula y cómo no debe interpretarse.
 */
export interface MetricDef {
  nombre: string;
  calculo: string;
  matiz?: string;
}

export const DEFS: Record<string, MetricDef> = {
  activo: {
    nombre: 'Tiempo activo',
    calculo:
      'Se acumula con la ventana enfocada y actividad en los últimos 2 minutos: teclado, cursor, cambios de archivo o un comando corriendo en el terminal.',
    matiz: 'El umbral de 2 minutos es configurable y sigue el valor con mejor respaldo empírico.',
  },
  primerPlano: {
    nombre: 'Primer plano',
    calculo: 'Tiempo con la ventana del editor enfocada, haya o no interacción. Incluye el tiempo activo.',
    matiz: 'Leer y entender código ocupa la mayor parte de la jornada y apenas genera pulsaciones.',
  },
  segundoPlano: {
    nombre: 'Segundo plano',
    calculo: 'Proyecto abierto mientras usas otra aplicación, hasta el límite de gracia configurado.',
  },
  terminal: {
    nombre: 'Terminal',
    calculo: 'Parte del tiempo activo transcurrida con un comando en marcha en el terminal integrado.',
    matiz: 'Incluye agentes de línea de comandos, compilaciones largas y pruebas.',
  },
  sesionesFoco: {
    nombre: 'Sesiones de foco',
    calculo: 'Bloques continuos de trabajo de 15 minutos o más, sin pausas largas.',
    matiz:
      'Se cuentan sesiones, no horas: la investigación muestra que el número de sesiones predice la concentración percibida y el total de horas no.',
  },
  diasConFoco: {
    nombre: 'Días con foco',
    calculo: 'Porcentaje de días activos en los que hubo al menos una sesión de foco.',
    matiz: 'Es el indicador de concentración con mejor validación publicada.',
  },
  fragmentacion: {
    nombre: 'Fragmentación',
    calculo: 'Número medio de sesiones por día activo. Más sesiones significa una jornada más troceada.',
  },
  compilaciones: {
    nombre: 'Compilaciones',
    calculo: 'Tareas y comandos de compilación detectados, con su duración y su código de salida.',
    matiz: 'Se muestra la mediana y el percentil 90, no la media: una compilación en frío distorsionaría el promedio.',
  },
  pruebas: {
    nombre: 'Pruebas',
    calculo: 'Ejecuciones de pruebas detectadas, con duración y resultado.',
  },
  espera: {
    nombre: 'Tiempo de espera',
    calculo: 'Suma del tiempo esperando a que compilen o pasen las pruebas.',
    matiz: 'Mide el sistema, no a la persona. Si sube, hay algo que arreglar en el proyecto.',
  },
  tasaFallo: {
    nombre: 'Tasa de fallo',
    calculo: 'Proporción de compilaciones y pruebas que terminaron con error.',
    matiz: 'Un valor alto y sostenido suele indicar un entorno frágil, no descuido de quien programa.',
  },
  lineas: {
    nombre: 'Líneas',
    calculo: 'Líneas añadidas y eliminadas dentro del editor. Reescribir una línea cuenta en ambos lados.',
    matiz:
      'No mide productividad ni rendimiento. El código pegado o generado por asistentes no aparece, y escribir más líneas no es hacerlo mejor.',
  },
  racha: {
    nombre: 'Racha',
    calculo: 'Días consecutivos con actividad registrada, contando hasta hoy.',
  },
  consistencia: {
    nombre: 'Consistencia',
    calculo: 'De 0 a 100 según lo parecidas que sean las dedicaciones diarias entre sí en los últimos 30 días.',
    matiz: 'Regularidad, no cantidad: dedicar poco todos los días puntúa alto.',
  },
  horaPico: {
    nombre: 'Hora pico',
    calculo: 'Franja horaria con más tiempo activo acumulado.',
  },
};
