// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN — el único archivo que tienes que editar
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Pega aquí el «ID de cliente» que te da Google Cloud (paso 3 de la guía).
  GOOGLE_CLIENT_ID: 'PEGA_AQUI_TU_ID.apps.googleusercontent.com',

  // Carpeta de Drive donde se guardan los datos y las fotos.
  DRIVE_FOLDER_NAME: 'Inventario Casa',

  // Nombre del calendario que la app crea para los avisos.
  CALENDAR_NAME: 'Inventario casa',

  // Permisos que pide la app. No los cambies salvo que la guía lo indique.
  SCOPES: [
    'https://www.googleapis.com/auth/drive.file',            // solo los archivos que crea esta app
    'https://www.googleapis.com/auth/calendar.app.created',  // solo el calendario que crea esta app
  ],
};
