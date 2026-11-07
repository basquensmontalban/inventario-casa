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

- **Botón verde (centro)**: escanear. Si el código ya existe, añades o gastas existencias. Si es nuevo, la app lo busca en **Open Food Facts** (base pública y gratuita) y rellena nombre, marca, formato y foto; luego eliges crear el artículo o añadirlo como otra marca de uno que ya tienes (si encaja con uno de tus básicos, te lo propone).
- **«Se ha acabado»** (en la ficha y al escanear): pone a cero lo que hay a mano, deja la reserva y lo apunta en la lista. Se puede deshacer.
- **Artículos**: cada uno puede tener varias marcas con su código; la ★ es la favorita y es la que sale en la lista de la compra. Las existencias van por lotes (marca + caducidad) y al gastar se usa primero lo que caduca antes.
- **Mínimo y «Reponer hasta»**: cuando hay menos del mínimo, el artículo pasa solo a la lista de la compra con la cantidad que falta hasta el objetivo. Si apagas **Reponer**, no entra nunca.
- **Listas**: «General» recibe todo por defecto. Crea las que quieras (IKEA, Comida…), mueve artículos entre ellas o asigna a cada artículo su **lista habitual**. Puedes añadir cosas que no están en el inventario.
- **Al comprar**: por defecto, al tocar el círculo la cosa va **al carro**. En casa, «🧺 Guardar la compra» pasa todo lo del carro al inventario de una vez (cantidad, caducidad y dónde va). Todo viene marcado para guardar (lo que no estaba en el inventario se crea como artículo nuevo); al terminar se ve dónde ha ido cada cosa, con «Verlo en el inventario» y «Deshacer». En Ajustes › Compra puedes cambiarlo por «preguntar» o «sumar directamente».

## Ubicaciones

En **Ajustes › Ubicaciones** creas estancias, muebles y estantes (hasta 3 niveles) y marcas cuáles son **de reserva**. La lista se despliega con las flechas (▸ / ▾).
Las existencias de un artículo pueden estar repartidas: lo que está en reserva no cuenta como «a mano» ni para el mínimo de compra.
Desde la ficha de un artículo puedes mover existencias de un sitio a otro o «traer de la reserva».

- **Colores**: cada estancia tiene un color y lo que hay dentro lo hereda cada vez más clarito (cocina verde fuerte › armario verde medio › balda verde clarito). Lo que está a mano va en **tonos fríos** y la reserva en **tonos cálidos**. En cada ubicación puedes elegir otro color o un símbolo (🧊, 🗄️…).
- **Elegir sitio**: al guardar, mover o crear algo, «Dónde» abre el árbol de ubicaciones: tocas la flecha para desplegar y el nombre para elegir. Con muchas ubicaciones sale también un buscador.
- **Inventario › 🗂️ Por sitios**: el inventario como árbol desplegable (estancia › mueble › estante) con lo que hay en cada sitio y cuántas cosas tiene. Recuerda qué tenías desplegado.

## Lista de la compra (pantalla principal)

- La app se abre en **Compra**, que es la primera pestaña.
- **Buscador para apuntar** (arriba del todo y con el botón «Apuntar»): busca a la vez en el inventario, en la base de productos y en lo que hayáis apuntado antes. Entiende sin tildes, con erratas («garbansos», «curri») y por sinónimos («nam pla» → Salsa de pescado, «AOVE» → Aceite de oliva virgen extra). Pulsa Intro o toca una sugerencia y el cursor se queda para seguir apuntando. Si ya estaba en la lista, suma 1.
- La lista se ordena **por categorías (pasillos)** con un encabezado para cada una; se puede cambiar en Ajustes › Compra.
- Al escanear un código conocido aparece «Apuntar en la lista de la compra».
- Cada fila tiene **− / +** para la cantidad y puede llevar una **nota** («sin lactosa», «la grande»), que sale también al copiar la lista.
- **Soléis comprar**: sugerencias según lo que compráis y cada cuánto (en verde, lo que ya os toca). Un toque y se apunta.
- **🛒 Modo súper**: pantalla grande, se tacha con un toque, lo tachado baja a «En el carro», barra de progreso («8 de 15») y la pantalla no se apaga. Al terminar ofrece guardar la compra.
- **Orden de pasillos por tienda**: en Ajustes › Lista de tiendas › (tienda) › «🧭 Orden de pasillos». Al filtrar por esa tienda (o en el modo súper) la lista sale en ese orden.
- Con la compra abierta, la app comprueba cada 20 segundos si el otro móvil ha cambiado algo (solo descarga si hay cambios).

### Apuntar sin abrir la app

- **Android**: mantén pulsado el icono → «Apuntar», «Súper», «Escanear» o «Guardar compra».
- **iPhone**: con la app Atajos se crea «Oye Siri, apunta en la compra» (instrucciones y dirección en Ajustes › Compra › «Apuntar sin abrir la app»). La dirección es `https://basquensmontalban.github.io/inventario-casa/?apuntar=` seguida de lo que dictes («leche, tomates y papel»). Ojo: el atajo abre la app en Safari, que guarda sus datos aparte; conecta Google también en Safari una vez para que lo apuntado llegue a la app y al otro móvil.

## Categorías y base de productos

- **Categorías con subcategorías** (Ajustes › Categorías): viene «🍽️ Alimentación» con 23 subcategorías típicas (fruta, verdura, carne, pescado, lácteos, conservas, legumbres…), cada una con su símbolo. Puedes crear otras categorías (Limpieza, Higiene, Mascotas…) y sus subcategorías. Filtrar por una categoría incluye sus subcategorías.
- **Base de productos** (botón «＋ Básicos» en el inventario): 416 productos: 170 básicos y un paquete de 246 especias, hierbas, chiles y pimientas, mezclas (garam masala, ras el hanout…), pastas de curry (tailandesas de todos los colores, indias, japonesa…), salsas asiáticas (nam pla, ostras, hoisin…), salsas, aceites, vinagres y caldos, con símbolo, subcategoría, unidad, dónde se guardan (nevera, congelador o despensa, si tienes ubicaciones con esos nombres) y cuánto suelen durar. Marca varios y se crean de golpe. En «Nuevo artículo», al escribir el nombre de un básico se rellenan solos esos datos.
- **Caducidad aproximada**: al añadir existencias de un básico aparece «Poner dd/mm (aprox.)». Es orientativa: revisa la etiqueta.

## Ideas de recetas con lo que tienes

En Recetas › «✨ Ideas con lo que tengo» se genera un texto con lo que hay en casa (solo comida, por defecto solo lo que está a mano), lo que caduca pronto y las recetas que ya tienes. Cópialo y pégalo en Claude: te propondrá recetas y te pasará el archivo para importarlas.

## Etiquetas y tiendas

- **Tiendas**: en cada artículo indicas dónde se compra. Se puede filtrar por tienda en el inventario y en la compra (lo que no tiene tienda sale aparte).
- **Pestaña Tiendas**: para cada tienda, lo que hay que comprar allí, sugerencias («quizás también»: lo que se ha acabado, está por debajo de lo que soléis tener o caduca pronto) y todo lo que soléis comprar allí.

## Recetas

- Cada receta tiene foto, tiempos de preparación y cocción, raciones (se pueden escalar), ingredientes, pasos, notas y fuente.
- Los ingredientes se **vinculan** con artículos del inventario. Así la receta sale en **verde** si tienes todo a mano, en **naranja** si faltan 1 o 2 y en **rojo** si faltan más. La reserva no cuenta; los ingredientes **básicos** (sal, agua…) y los **opcionales** no cuentan para el color.
- **A la lista**: añade solo lo que falta o todos los ingredientes (puedes desmarcar).
- **Ingredientes con sugerencias**: al escribir un ingrediente («ceb») salen debajo los que empiezan así: lo que tenéis en el inventario (marcado «En casa»), los productos de la base de datos de la app (los mismos que se proponen al apuntar en la lista) y los que ya usáis en otras recetas. Si lo que escribes coincide del todo con uno (sin contar tildes ni plurales: «tomate» → «Tomates»), al darle a OK se elige solo; si es una variante tuya («cebolla morada asada»), se queda tal cual. Los de la base de datos que aún no tenéis salen como «… · aún no en casa» y se vinculan solos en cuanto los compréis.
- **La he cocinado**: descuenta del inventario lo usado y, si sobran raciones, las guarda como **tupper** (ver más abajo).
- **Filtros**: disponibilidad, tiempo, ingrediente, «Tipo de plato» (desayuno, entrante, primero, plato principal, postre, salsa), «Momento» (desayuno, comida, cena…), «Tipo» (ligero/pesado), favoritas y los que crees en «⚙ Filtros de recetas».
- **Imprescindibles y recomendados**: la receta sale en 🔴 rojo si falta algún imprescindible, en 🟡 amarillo si tienes lo imprescindible pero faltan la mitad o más de los recomendados, y en 🟢 verde en los demás casos. Si un ingrediente no se vinculó a mano, la app lo busca en el inventario por el nombre cada vez.
- **Ficha completa**: consejos clave, salsas y aderezos que le van bien, conservación (si se congela y cuánto, días en nevera, horas sin refrigerar) y nota de 0 a 10 de cada uno.
- **Nutrición y salud**: kcal, proteína, hidratos, grasas y fibra por ración, calculados a partir de los ingredientes con una tabla de composición (estimación), y una puntuación de salud de 0 a 100 con el criterio del recetario: S = máx(0, proteína y fibra (30) + carga glucémica (25) + grasas (25) + vitaminas y minerales (20) − sodio/potasio y cocción a más de 180 °C). Toca la puntuación para ver el desglose. En Ajustes › «Puntuación de salud» (común a los dos móviles) se puede ajustar cuánto pesa cada cosa que suma y cuánto resta cada castigo, incluidos castigos que el documento no tenía: grasa saturada, embutidos y carnes procesadas, carne roja y muchas calorías por ración. Mientras mueves los deslizadores ves cómo cambia la nota de algunas de vuestras recetas; «Volver al criterio del documento» lo deja como al principio.
- **Favoritas con nombre**: en Ajustes › «Quiénes sois» (o desde cualquier receta) ponéis vuestros nombres. En cada receta, cada uno marca la suya con ❤️ y los dos veis las de los dos.
- **Organizar**: disponibles primero, orden alfabético, más rápidas, **por tipo de plato** (con apartados) o **por favoritas** (de todos, de cada uno y las demás).

## Tuppers (batch cooking)

Al pulsar **La he cocinado** (en la receta o en el menú), en «🫙 ¿Sobran raciones?» indicas cuántas raciones van **a la nevera** y cuántas **al congelador**. La app propone la nevera y el congelador que tengáis en Ubicaciones (cualquier sitio que se llame «Nevera»/«Frigo» o «Congelador») y la fecha según la receta: los días que aguanta en la nevera o los meses que aguanta congelada (3 días o 3 meses si la receta no lo dice).
- Se guardan como un artículo «Tupper de …» **en raciones**, con la etiqueta «Platos preparados»: sale en el inventario en su sitio, con su fecha y con sus avisos de caducidad. Nunca va a la lista de la compra.
- En la **ficha de la receta** se ve cuántas raciones hay y dónde; «Comer una ración» descuenta una (primero la de la nevera). En la lista de recetas, la tarjeta lleva 🫙 y el número de raciones.
- En el **menú**, al añadir un plato aparece «🫙 De lo que tenéis guardado». Un plato del tupper no apunta ingredientes a la lista; «🍽️ Sacar» descuenta sus raciones. Desde la ficha, «Añadir al menú» propone ponerlo del tupper si quedan raciones.

## Menú semanal

En Recetas › «📅 Menú semanal»: cada día tiene comida y cena (también desayuno y merienda, si los activas en «⚙ Comidas»). Cada comida puede tener **varios platos** (entrante, primero, segundo, guarnición, postre), cada uno una receta con sus raciones o un texto libre («sobras», «pizza»). Al añadir, elige el tipo y ve tocando recetas: después del entrante se propone el primero, luego el segundo… También se puede añadir desde la ficha de una receta.
- **Apuntar ingredientes desde el menú**: «A la lista» en cada plato, «Apuntar los ingredientes de esta comida» y el 🛒 de cada día.
- **🛒 Lista de la semana**: suma los ingredientes de todas las recetas (ajustados a las raciones), resta lo que tenéis a mano (sin la reserva) y apunta solo lo que falta. Lo no vinculado al inventario se suma por nombre. Las comidas ya cocinadas no cuentan.
- **La hemos cocinado**: descuenta los ingredientes y marca la comida con ✓.
- **Copiar menú**: texto listo para WhatsApp.
- **Balance del día y de la semana**: cada día con platos muestra una nota de 0 a 100 (toca para ver el detalle): 40 % la salud media de los platos y 60 % el reparto (proteína, hidratos y grasas en % de la energía, grasas saturadas, fibra y sal por cada 1000 kcal). La semana suma además la variedad (legumbres, pescado y carne roja, según las recomendaciones de la AESAN) cuando hay al menos 8 platos con receta. Cuenta una ración de cada plato por persona y valora proporciones, así que sirve aunque solo planifiquéis comida y cena.

### Formato de receta para importar

Pídele a Claude «una receta para importar en la app del inventario». En la app: Recetas › Importar receta › elegir el archivo o pegar el texto.

```json
{
  "app": "inventario-casa", "kind": "recipe", "version": 1,
  "recipe": {
    "name": "Garbanzos con espinacas", "servings": 4, "prepMinutes": 10, "cookMinutes": 20,
    "course": ["Primero"], "meal": ["Comida", "Cena"], "weight": "Ligero", "extra": { "Cocina": ["Andaluza"] },
    "ingredients": [
      { "name": "Garbanzos cocidos", "qty": 800, "unit": "g" },
      { "name": "Comino molido", "qty": 1, "unit": "cdta", "optional": true },
      { "name": "Sal", "basic": true }
    ],
    "steps": ["Paso 1…", "Paso 2…"], "notes": "", "source": ""
  }
}
```

Unidades: ud, g, kg, ml, l, cda (cucharada), cdta (cucharadita), taza, vaso, pizca, diente, lata, manojo, rodaja. Para varias recetas a la vez: `"recipes": [ … ]`.

## Ajustes

Ajustes está organizado por secciones:

- **Este móvil** (cada móvil tiene los suyos y se guardan en Drive): General (pestañas que se ven, pestaña al abrir, tema claro/oscuro, tamaño de letra, vibración), Inventario (filtros que se ven, orden, mostrar agotados, ubicación preferida, valores de los artículos nuevos), Compra (lista y tienda al abrir, orden, qué pasa al tachar, «Soléis comprar», letra del modo súper, formato al copiar, Siri), Recetas (cuándo sale naranja, orden, filtros que se ven, raciones, lista por defecto y comidas del menú semanal) y Tiendas (tienda al abrir, sugerencias). En «Copia de esta configuración» se recupera en un móvil nuevo, se guarda en un archivo o se vuelve a los valores de fábrica.
- **Común a los dos móviles**: ubicaciones, etiquetas, lista de tiendas, listas de la compra, filtros de recetas, avisos y copias de seguridad.

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
Si los dos cambiáis lo mismo a la vez (o sin conexión), la app **junta los dos cambios**: en las existencias suma lo que hizo cada uno (si uno gasta 1 y el otro añade 3, quedan 2 más), en los platos del menú y las etiquetas se quedan los de los dos, y en los demás datos se combina campo a campo. Solo si los dos cambiáis el mismo dato (por ejemplo, el nombre) se queda el más reciente.
Si una subida a Drive falla, los cambios siguen pendientes y se vuelven a subir solos en la siguiente sincronización.
Usad los dos móviles con la misma versión de la app. Desde la 1.10.1, si un móvil tiene una versión más antigua que la que ya ha subido el otro, no sube nada: muestra «Actualiza la app» y guarda sus cambios hasta actualizarse.

## Actualizar la app

Si cambias algún archivo, súbelo a GitHub y cambia también la línea `VERSION` de `sw.js` (por ejemplo, `inv-v1.0.1`).
Los móviles cogen la versión nueva la segunda vez que abren la app.

## Si algo falla

- **«Sin configurar»**: falta el ID en `config.js` (paso 3).
- **Error 400 `redirect_uri_mismatch` al conectar**: la dirección del paso 2.6 no coincide exactamente con la de la app (revisa la barra final).
- **Error 403 `access_denied`**: la cuenta no está en *Usuarios de prueba* (paso 2.5).
- **Error de permisos en el calendario**: en `config.js`, cambia `calendar.app.created` por `calendar` y vuelve a conectar.
- **«Conectar» aparece a menudo**: Google pide renovar el permiso cada hora. Con *Reconectar al abrir la app* activado en Ajustes se hace solo: al abrir la app y también con ella abierta, cuando lleváis un rato sin tocarla (nunca con una ficha abierta, escribiendo o en el modo súper).
- **Google vuelve a pedir el permiso completo cada semana**: suele pasar mientras el proyecto de Google Cloud está «En prueba». Para evitarlo: Google Cloud › *Pantalla de consentimiento de OAuth* (o *Audiencia*) › **Publicar aplicación**. Para vuestro uso no hace falta que Google la verifique; si al conectar sale el aviso de «app no verificada», se acepta en *Configuración avanzada › Ir a …*.
