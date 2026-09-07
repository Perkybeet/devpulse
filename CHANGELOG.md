# Changelog

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
