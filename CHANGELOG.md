# Changelog

## 1.2.0

- **Modo servidor opcional**: la extensión puede enviar la actividad a una instalación propia de la organización. Desactivado de fábrica; sin configurarlo todo sigue siendo local.
- **Clasificación de proyectos**: al abrir un proyecto nuevo se pregunta si es de trabajo o personal. Los personales no salen nunca del equipo, y mientras no se responda tampoco se envía nada. La decisión se puede cambiar en cualquier momento.
- La actividad viaja en bloques de un minuto topados a 60 segundos, de forma que el servidor pueda garantizar que nadie declara más jornada que tiempo transcurrido.
- Cola de envío persistente: si falla la red o se cierra el editor, nada se pierde y se reintenta más tarde.
- El token de acceso se guarda en el almacén de secretos del editor.

## 1.1.0

- **Tiempo de terminal**: los comandos que se ejecutan en el terminal integrado cuentan como tiempo activo. Cubre el trabajo con agentes de línea de comandos, compilaciones largas y pruebas, que hasta ahora no quedaba registrado.
- **Compilaciones y pruebas**: nueva sección con la duración (mediana y percentil 90), la tasa de fallo y el tiempo total de espera. Se detectan tanto tareas de VS Code como comandos del terminal y sesiones de depuración.
- **Concentración**: sesiones de foco, porcentaje de días con al menos una y fragmentación de la jornada. Se cuentan sesiones y días en lugar de horas acumuladas, siguiendo la evidencia disponible.
- **Panel rediseñado**: iconos con color por categoría, explicación de cada métrica con su fórmula y sus matices, y lenguajes identificados con su color oficial.
- Nueva hoja de Excel con las compilaciones y pruebas, y columnas de tiempo en terminal en Proyectos y Diario.
- El CSV incluye la columna `SegundosTerminal`.
- Requiere VS Code 1.93 o superior para la medición del terminal.

## 1.0.1

- El selector de proyectos aparece siempre al exportar, también cuando solo hay un proyecto registrado.
- Las columnas de coste solo se incluyen si se ha configurado una tarifa por hora.
- Corregida la pérdida de datos cuando había varias ventanas de VS Code abiertas a la vez: cada ventana guarda ahora en su propia partición y los informes las fusionan.

## 1.0.0

Versión inicial.

- Registro automático de tiempo por proyecto: activo, primer plano y segundo plano, con detección de inactividad y coalescencia de sesiones.
- Métricas: diarias, semanales (ISO), mensuales y totales; medias, rachas, consistencia, tendencia, ratio de foco, horas pico, líneas añadidas/eliminadas, archivos, lenguajes y coste estimado.
- Panel de métricas con KPIs, gráfico de 30 días, mapa de calor semana × hora, tabla de proyectos y lenguajes.
- Barra de estado con el tiempo de hoy.
- Exportación a Excel (9 hojas), CSV (formato Excel es-ES) y JSON, con selección de proyectos a incluir.
- Firma Ed25519 de todas las exportaciones y comando de verificación de integridad para administradores.
- Datos 100 % locales, particionados por mes, con copia de seguridad automática al restablecer.
