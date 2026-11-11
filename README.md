# Mi biblioteca

Aplicación web básica que funciona como biblioteca personal: sirve para llevar el registro de los libros que lees, los que estás leyendo y los que quieres leer.

## Qué hace

- Añadir libros buscándolos por título (autor, género, páginas y portada se rellenan solos).
- Marcar un libro como «leyendo», apuntar la página por la que vas y finalizarlo con valoración y resumen.
- Guardar notas y citas de cada libro, con su página.
- Importar de golpe una lista de libros desde un Excel, un CSV o un texto pegado.
- Organizar en listas: próximas lecturas, para releer y listas propias, y marcar libros y autores favoritos.
- Buscar y filtrar por autor, género, valoración y fechas.
- Buscar cualquier libro o autor: ficha de cada autor (foto, biografía breve y sus libros más conocidos) y de cada libro (resumen, fecha, autor y otros libros de la saga o parecidos).
- Reto anual de lectura, estadísticas por año y sugerencias de nuevos libros.
- Tema claro y oscuro.

## Cómo usarla

Es una aplicación web instalable (PWA): ábrela en el navegador y pulsa «Instalar aplicación» para tenerla con su icono en el ordenador o en el móvil.

Para probarla en local:

```
python3 -m http.server 8000
```

y abre `http://localhost:8000`.

## Datos

No hay servidor ni cuentas. Los libros se guardan en el navegador de cada dispositivo, así que no se sincronizan entre ellos. Desde «Perfil» se puede guardar y restaurar una copia de seguridad.

Si la persona lo acepta, la web recoge estadísticas anónimas de uso (visitas y acciones como añadir o terminar un libro) con [PostHog](https://posthog.com); nunca se envían los títulos ni el contenido de la biblioteca.

La información de los libros y las portadas vienen de [Open Library](https://openlibrary.org); las biografías, resúmenes y sagas, de [Wikipedia](https://es.wikipedia.org) y [Wikidata](https://www.wikidata.org).

## Cuentas y sincronización

La cuenta es opcional. Sin cuenta, todo se guarda solo en el dispositivo. Con cuenta (Google o enlace al correo), la biblioteca se guarda también en Supabase (proyecto `biblioteca`, región UE) y se sincroniza entre dispositivos. Cada usuario solo puede leer y modificar sus propios datos (seguridad a nivel de fila en las tablas `books` y `settings`). Si se edita el mismo libro en dos dispositivos, los cambios se mezclan campo a campo.

## Seguridad

- **Sin contraseñas propias:** se entra con Google o con un código de un solo uso por correo. La gestión de credenciales es de Supabase Auth.
- **Verificación en dos pasos (TOTP)** opcional desde «Perfil». Si está activada, la base de datos no deja leer ni escribir nada hasta verificar el código, aunque se tenga la sesión.
- **Aislamiento por usuario:** seguridad a nivel de fila; nadie puede ver, modificar ni crear datos de otra persona. Límites de tamaño y número de libros por usuario.
- **Contra XSS:** todo lo que se pinta se escapa, todo lo que entra (copias, nube, APIs externas) se sanea, y la CSP prohíbe JavaScript en línea.
- **Cabeceras:** CSP estricta, HSTS, sin iframes de terceros, `nosniff`, permisos del navegador desactivados.
- **Librería externa** con versión fija y huella de integridad (SRI).
- **Secretos:** el repositorio solo contiene claves públicas por diseño (la clave publicable de Supabase y la de proyecto de PostHog, que solo permiten lo que autorizan las reglas de la base de datos). `.gitignore` excluye `.env` y copias de seguridad.

## Privacidad

Las estadísticas de uso (PostHog) solo se activan si la persona las acepta en el aviso inicial o en «Perfil». La política está en `privacidad.html`.

## Archivos

- `index.html`: estructura y estilos.
- `app.js`: la lógica de la aplicación.
- `analytics.js`: estadísticas de uso, solo con consentimiento.
- `privacidad.html`: política de privacidad.
- `manifest.webmanifest`, `sw.js` e iconos: lo necesario para instalarla y usarla sin conexión.
- `version.json`: hace que la app instalada se actualice sola.
- `_headers`: cabeceras de seguridad (CSP, HSTS…) y de caché que aplica Cloudflare.
- `tests/`: pruebas automáticas (`run.js`) y de la base de datos (`rls_test.sql`).

## Publicar una versión nueva

1. Ejecuta las pruebas: `node tests/run.js` (deben salir todas correctas).
2. Sube el número de versión en tres sitios a la vez: `APP_VERSION` en `app.js`, `VERSION` en `sw.js` y `version.json`. Al abrir la app, si la versión publicada es distinta, se recarga sola con la nueva.
