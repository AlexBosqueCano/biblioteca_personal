# Mi biblioteca

Aplicación web básica que funciona como biblioteca personal: sirve para llevar el registro de los libros que lees, los que estás leyendo y los que quieres leer.

## Qué hace

- Añadir libros buscándolos por título (autor, género, páginas y portada se rellenan solos).
- Marcar un libro como «leyendo», apuntar la página por la que vas y finalizarlo con valoración y resumen.
- Guardar notas y citas de cada libro, con su página.
- Importar de golpe una lista de libros desde un Excel, un CSV o un texto pegado.
- Organizar en listas: próximas lecturas, para releer y listas propias.
- Buscar y filtrar por autor, género, valoración y fechas.
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

La información de los libros y las portadas vienen de [Open Library](https://openlibrary.org).

## Archivos

- `index.html`: toda la aplicación (HTML, CSS y JavaScript).
- `manifest.webmanifest`, `sw.js` e iconos: lo necesario para instalarla y usarla sin conexión.
