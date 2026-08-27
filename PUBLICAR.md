# Guía de publicación de DevPulse

## 0. Requisitos previos

- Node.js 18 o superior.
- Una cuenta Microsoft (sirve la personal o la de la organización).
- El proyecto compila y pasa los tests: `npm install && npm test`.

## 1. Crear el publisher en el Marketplace

1. Entra en https://marketplace.visualstudio.com/manage con la cuenta Microsoft personal (yago.lopez.adeje@gmail.com).
2. Pulsa **Create publisher**.
3. Elige el **ID** del publisher: `perkybeet`. Este ID debe coincidir con el campo `publisher` de `package.json`; si eliges otro, actualiza el campo antes de empaquetar.
4. Rellena el nombre visible (por ejemplo "Yago López") y guarda.
5. Opcional pero recomendado: en la ficha del publisher, añade y **verifica el dominio `bitbeet.dev`** (te pedirá crear un registro DNS TXT). Con eso la extensión sale con la insignia de publisher verificado.

## 2. Crear el Personal Access Token (PAT)

1. Entra en https://dev.azure.com y crea una organización si no tienes (cualquier nombre vale; solo se usa para emitir el token).
2. Icono de usuario → **Personal access tokens** → **New Token**.
3. Configuración del token:
   - **Organization**: *All accessible organizations* (importante).
   - **Expiration**: la que prefieras (máximo 1 año; habrá que renovarlo).
   - **Scopes**: *Custom defined* → **Marketplace → Manage**.
4. Copia el token: solo se muestra una vez.

## 3. Empaquetar y probar en local

```bash
cd ~/devpulse
npm install
npm test              # 58 tests deben pasar
npm run package       # genera devpulse-1.0.0.vsix
```

Prueba el paquete en tu VS Code antes de publicar:

```bash
code --install-extension devpulse-1.0.0.vsix
```

Abre un proyecto, trabaja unos minutos y comprueba la barra de estado, el panel (`Ctrl+Shift+P` → "DevPulse: Abrir panel de métricas") y una exportación a Excel con su verificación.

## 4. Publicar

```bash
npx vsce login perkybeet        # pega el PAT cuando lo pida
npx vsce publish                # publica la versión de package.json
```

Alternativa sin CLI: en https://marketplace.visualstudio.com/manage, botón **New extension → Visual Studio Code** y sube el `.vsix` a mano.

La extensión tarda unos minutos en aparecer y pasar la validación automática. Quedará en
`https://marketplace.visualstudio.com/items?itemName=perkybeet.devpulse-metrics`.

## 5. Actualizaciones futuras

```bash
npx vsce publish patch    # 1.0.0 → 1.0.1 (o "minor" / "major")
```

Actualiza antes el `CHANGELOG.md`. Los usuarios reciben la actualización automáticamente.

## 6. Opcional pero recomendado

- **Repositorio**: crea `Perkybeet/devpulse` en GitHub (cuenta personal) y haz push (el `package.json` ya apunta ahí). Si no quieres repo público, elimina el campo `repository`.
- **Open VSX** (para VSCodium, Cursor, Windsurf, etc.): crea cuenta en https://open-vsx.org, genera token y ejecuta `npx ovsx publish devpulse-1.0.0.vsix -p <token>`.
- **Distribución solo interna**: si no quieres el Marketplace público, basta con repartir el `.vsix` (por ejemplo desde un release privado de GitHub) e instalarlo con `code --install-extension`. Todo funciona igual, incluida la firma de informes.

## 7. Despliegue en la empresa

1. Cada desarrollador instala la extensión y ejecuta **DevPulse: Mostrar huella de la clave de firma**.
2. El administrador guarda la tabla desarrollador → huella (un simple Excel o página interna).
3. Los informes se entregan siempre por pares: `informe.xlsx` + `informe.xlsx.firma.json`.
4. Para auditar: **DevPulse: Verificar una exportación firmada** sobre el `.firma.json` y comparar la huella mostrada con la registrada.
