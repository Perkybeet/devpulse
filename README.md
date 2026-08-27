# DevPulse — Tiempo y métricas por proyecto

Registro automático y verificable del tiempo de desarrollo en VS Code. DevPulse mide cuánto se dedica a cada proyecto sin cronómetros manuales, calcula estadísticas útiles para el equipo y la administración, y exporta informes de Excel firmados criptográficamente para que nadie pueda alterarlos después de entregarlos.

## Qué mide

- **Tiempo activo**: tiempo con la ventana enfocada e interacción reciente (teclado, cursor, cambios de archivo). Es la métrica principal de dedicación.
- **Tiempo en primer plano**: ventana de VS Code enfocada, aunque no haya interacción.
- **Tiempo en segundo plano**: VS Code abierto sin foco, dentro de un periodo de gracia configurable.
- **Líneas añadidas y eliminadas** (churn de edición), caracteres escritos y guardados.
- **Archivos únicos editados** y **tiempo por lenguaje**.
- **Sesiones de trabajo**: bloques continuos de actividad; las pausas cortas no rompen la sesión.
- **Histograma por hora del día** (horas pico), por día de la semana, y agregados diarios, semanales (ISO), mensuales y totales.
- **Indicadores derivados**: media por día activo, media semanal y mensual, rachas de días consecutivos, índice de consistencia, tendencia (media móvil exponencial y regresión lineal), ratio de foco y coste estimado según tarifa/hora.

El tiempo se acumula con un muestreo de baja frecuencia (5 s por defecto) con detección de inactividad y protección frente a suspensiones del equipo: dejar el portátil abierto no infla las horas.

## Panel y barra de estado

- La barra de estado muestra el tiempo de hoy en el proyecto actual; el tooltip resume día, semana y mes.
- El comando **DevPulse: Abrir panel de métricas** abre un dashboard con KPIs, gráfico de actividad de los últimos 30 días con línea de tendencia, mapa de calor semana × hora, tabla por proyecto y distribución por lenguajes. Se adapta al tema claro/oscuro del editor.

## Exportación

Comandos **Exportar informe a Excel (.xlsx)**, **Exportar datos a CSV** y **Exportar datos a JSON**.

- Antes de exportar puedes **elegir qué proyectos incluir**: los proyectos personales quedan fuera del informe si los desmarcas.
- El Excel incluye 9 hojas: Resumen (KPIs), Proyectos, Diario, Semanal, Mensual, Lenguajes, Sesiones, Horas del día y Verificación.
- El CSV usa separador `;`, decimales con coma y BOM UTF-8, de modo que Excel en español lo abre directamente.

## Integridad y verificación de informes

Cada exportación se firma con una clave **Ed25519** generada en la instalación del desarrollador:

1. Junto al informe se crea un fichero `*.firma.json` con los datos canónicos, el hash SHA-256 del contenido y del propio fichero exportado, y la firma.
2. El administrador verifica cualquier informe con **DevPulse: Verificar una exportación firmada**. Si el Excel, el CSV o la firma se tocaron después de generarse, la verificación falla e indica el motivo.
3. Cada desarrollador comunica una única vez su huella de clave (**DevPulse: Mostrar huella de la clave de firma**). La huella aparece en cada firma y en la hoja Verificación del Excel, lo que permite atribuir cada informe a la instalación que lo emitió y detectar re-firmados con otra clave.

Alcance de la garantía: la firma hace **detectable cualquier manipulación posterior a la exportación** y vincula el informe a una instalación concreta. Como en cualquier sistema de registro en el equipo del usuario, la fiabilidad del dato en origen depende de esa instalación; la huella registrada es lo que impide sustituir la clave sin que se note.

## Privacidad

Todos los datos se guardan **solo en tu equipo**, en el almacenamiento global de la extensión, particionados por mes en JSON. DevPulse no envía nada a ningún servidor. El comando **Abrir carpeta de datos** muestra los ficheros; **Restablecer datos** crea siempre una copia de seguridad antes de vaciar.

## Comandos

| Comando | Descripción |
|---|---|
| `DevPulse: Abrir panel de métricas` | Dashboard con KPIs y gráficos |
| `DevPulse: Exportar informe a Excel (.xlsx)` | Informe completo firmado |
| `DevPulse: Exportar datos a CSV` | Datos diarios firmados, formato Excel es-ES |
| `DevPulse: Exportar datos a JSON` | Datos en bruto firmados |
| `DevPulse: Verificar una exportación firmada` | Comprueba integridad y huella de un informe |
| `DevPulse: Mostrar huella de la clave de firma` | Huella a registrar por el administrador |
| `DevPulse: Abrir carpeta de datos` | Abre el directorio de datos local |
| `DevPulse: Restablecer datos (con copia de seguridad)` | Vacía los datos tras crear una copia |

## Configuración

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `devpulse.idleTimeoutSeconds` | `120` | Segundos sin interacción para dejar de contar tiempo activo |
| `devpulse.sessionGapSeconds` | `600` | Pausa máxima que mantiene viva una sesión |
| `devpulse.backgroundGraceSeconds` | `1800` | Máximo de segundo plano contabilizado tras perder el foco |
| `devpulse.tickSeconds` | `5` | Frecuencia interna de muestreo |
| `devpulse.hourlyRate` | `0` | Tarifa por hora para estimar coste (0 = sin coste) |
| `devpulse.currency` | `EUR` | Moneda de los informes |
| `devpulse.excludedProjects` | `[]` | Carpetas de proyecto que no se registran nunca |

## Preguntas frecuentes

**¿Las líneas añadidas/eliminadas son el diff de git?**
No: miden el trabajo de edición (churn). Reescribir una línea cuenta en ambos lados. Es una medida de esfuerzo, no de tamaño final del cambio.

**¿Qué pasa si dejo VS Code abierto toda la noche?**
Nada: sin interacción el tiempo activo se corta a los 2 minutos, el segundo plano a los 30, y una suspensión del equipo no acredita el hueco.

**¿Funciona con varios proyectos en la misma ventana (multi-root)?**
Sí: el tiempo se atribuye al proyecto del archivo activo.

## Licencia

MIT
