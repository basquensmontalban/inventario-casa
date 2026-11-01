# Inventario de casa

App para el móvil: qué hay en casa, dónde está, cuándo caduca y qué hay que comprar.
Funciona sin conexión y se sincroniza con Google Drive cuando hay internet.
Los avisos llegan como eventos de Google Calendar.

- **El código** está en GitHub (es público, pero no contiene ningún dato vuestro).
- **Los datos y las fotos** están en vuestro Drive, carpeta «Inventario Casa», y solo se ven con vuestra cuenta de Google.

---

## Paso 1 · Subir la app a GitHub (10 min)

1. Entra en [github.com](https://github.com) con tu cuenta.
2. Arriba a la derecha, **+ → New repository**.
   - Nombre: `inventario-casa`
   - Marca **Public** (GitHub Pages gratis solo funciona con repositorios públicos).
   - Pulsa **Create repository**.
3. En la página del repositorio vacío, pulsa **uploading an existing file**.
4. Arrastra (o selecciona) **todos los archivos** de esta carpeta y pulsa **Commit changes**.
5. Ve a **Settings → Pages**. En *Branch* elige `main` y carpeta `/ (root)`, y pulsa **Save**.
6. Espera 1–2 minutos. Tu app estará en:
   `https://TU-USUARIO.github.io/inventario-casa/`

Apunta esa dirección: la necesitas en el paso 2.

## Paso 2 · Preparar Google Cloud (15 min, una sola vez)

Hazlo **con la cuenta de Google conjunta**, la misma donde se guardarán los datos.

1. Entra en [console.cloud.google.com](https://console.cloud.google.com).
2. Arriba, en el selector de proyectos: **Proyecto nuevo** → nombre `Inventario casa` → **Crear**. Asegúrate de que queda seleccionado.
3. **Activa las dos APIs**: menú ☰ → *APIs y servicios* → *Biblioteca*. Busca y pulsa **Habilitar** en:
   - **Google Drive API**
   - **Google Calendar API**
4. **Pantalla de consentimiento** (puede llamarse *Google Auth Platform*): menú ☰ → *APIs y servicios* → *Pantalla de consentimiento de OAuth* → **Comenzar**.
   - Nombre de la app: `Inventario de casa`; correo de asistencia: la cuenta conjunta.
   - Público / tipo de usuario: **Externo**.
   - Datos de contacto: la cuenta conjunta. Acepta y **Crear**.
5. **Usuarios de prueba**: en la sección *Público* (o *Audiencia*), en *Usuarios de prueba* pulsa **Add users** y añade el correo de la cuenta conjunta. Deja la app en modo *Prueba*: no hace falta publicarla ni que Google la verifique.
6. **Crea el cliente**: sección *Clientes* (o *Credenciales → Crear credenciales → ID de cliente de OAuth*).
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes de JavaScript autorizados**: `https://TU-USUARIO.github.io`
   - **URI de redireccionamiento autorizados**: `https://TU-USUARIO.github.io/inventario-casa/` (con la barra final).
   - Pulsa **Crear** y **copia el ID de cliente** (termina en `.apps.googleusercontent.com`).

## Paso 3 · Poner el ID en la app (2 min)

1. En tu repositorio de GitHub, abre `config.js` y pulsa el lápiz ✏️ (*Edit*).
2. Sustituye `PEGA_AQUI_TU_ID.apps.googleusercontent.com` por el ID que copiaste. Mantén las comillas.
3. Pulsa **Commit changes**. En 1–2 minutos la web se actualiza.

## Paso 4 · Instalarla en los móviles

- **iPhone**: abre la dirección en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
- **Android**: abre la dirección en **Chrome** → menú ⋮ → **Instalar aplicación** (o *Añadir a pantalla de inicio*).

Abre la app desde el icono → toca **Conectar** (arriba) → elige la cuenta conjunta.
Google avisará de que *la app no está verificada*: es normal porque la has creado tú. Pulsa **Continuar** y acepta los permisos.

La app solo puede ver los archivos que ella misma crea en Drive y el calendario que ella misma crea. No ve el resto de vuestro Drive ni vuestros otros calendarios.

## Paso 5 · Que lleguen los avisos

La app crea el calendario **«Inventario casa»** en la cuenta conjunta. Para recibir las notificaciones:

- Instalad la app **Google Calendar** en los dos móviles e iniciad sesión con la cuenta conjunta (además de vuestras cuentas personales, si queréis).
- Comprobad que el calendario «Inventario casa» está activado y con las notificaciones permitidas.

En **Ajustes** de la app podéis elegir: avisar de todo, solo de los artículos marcados como críticos, o de nada; los días de antelación y la hora.

---

## Cómo se usa

- **Botón verde (centro)**: escanear. Si el código ya existe, añades o gastas existencias. Si es nuevo, creas el artículo o lo añades como otra marca de uno que ya tienes.
- **Artículos**: cada uno puede tener varias marcas con su código; la ★ es la favorita y es la que sale en la lista de la compra. Las existencias van por lotes (marca + caducidad) y al gastar se usa primero lo que caduca antes.
- **Mínimo y «Reponer hasta»**: cuando hay menos del mínimo, el artículo pasa solo a la lista de la compra con la cantidad que falta hasta el objetivo. Si apagas **Reponer**, no entra nunca.
- **Listas**: «General» recibe todo por defecto. Crea las que quieras (IKEA, Comida…), mueve artículos entre ellas o asigna a cada artículo su **lista habitual**. Puedes añadir cosas que no están en el inventario.
- **Al comprar**: toca el círculo y elige cuánto has comprado (y la caducidad) para que se sume al inventario, o solo tacharlo.

## Ubicaciones

En **Ajustes › Ubicaciones** creas estancias, muebles y estantes (hasta 3 niveles) y marcas cuáles son **de reserva**.
Las existencias de un artículo pueden estar repartidas: lo que está en reserva no cuenta como «a mano» ni para el mínimo de compra.
Desde la ficha de un artículo puedes mover existencias de un sitio a otro o «traer de la reserva».

## Copias de seguridad

- **Automáticas** en Drive › Inventario Casa › Copias de seguridad (cada día, cada 3 días o cada semana, en Ajustes).
  Se guardan las últimas (15–120) y, además, la primera de cada mes para siempre. Lo que sobra va a la papelera de Drive.
- **Antes de actualizar la app o de restaurar**, se hace una copia especial que no se borra nunca.
- El **móvil** guarda una copia al día (las 7 últimas) aunque no haya conexión.
- **Documento legible**: crea un Google Docs con todo (qué hay y dónde, listas, fichas, ubicaciones), también a partir de cualquier copia antigua.
- La **configuración de cada móvil** se guarda aparte y se puede recuperar en un móvil nuevo.

## Sin conexión

Todo se guarda en el móvil y funciona sin internet. Al volver la conexión, se sincroniza solo.
El lector de códigos se descarga la primera vez que lo usas con conexión; después funciona sin ella.
Si los dos editáis el mismo artículo sin conexión, se queda el cambio más reciente.

## Actualizar la app

Si cambias algún archivo, súbelo a GitHub y cambia también la línea `VERSION` de `sw.js` (por ejemplo, `inv-v1.0.1`).
Los móviles cogen la versión nueva la segunda vez que abren la app.

## Si algo falla

- **«Sin configurar»**: falta el ID en `config.js` (paso 3).
- **Error 400 `redirect_uri_mismatch` al conectar**: la dirección del paso 2.6 no coincide exactamente con la de la app (revisa la barra final).
- **Error 403 `access_denied`**: la cuenta no está en *Usuarios de prueba* (paso 2.5).
- **Error de permisos en el calendario**: en `config.js`, cambia `calendar.app.created` por `calendar` y vuelve a conectar.
- **«Conectar» aparece a menudo**: Google pide renovar el permiso cada hora. Con *Reconectar al abrir la app* activado en Ajustes se hace solo.
