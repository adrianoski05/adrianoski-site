# Adrianoski · sitio web

Sitio estático: HTML, CSS y JavaScript sin frameworks ni dependencias.

```
index.html   estructura y textos (línea de tiempo, contacto, menú)
styles.css   estilos
main.js      animaciones y efectos (configuración arriba de todo)
assets/      foto.webp (vos), codigo.png (retrato de código), robot.webp (alternativa)
```

## Verlo en tu computadora
Abrí una terminal en esta carpeta y corré:

```
python3 -m http.server 8000
```

Después entrá a http://localhost:8000. Usá un servidor local y no abras el archivo con doble clic, porque algunos navegadores bloquean las imágenes del canvas desde `file://`.

## Qué editar
- **Email y WhatsApp:** en `main.js`, `CONFIG.email` y `CONFIG.whatsapp` (formato `https://wa.me/549...`). Se actualizan solos los botones y los comandos.
- **Redes sociales:** en `index.html`, sección `contacto`. Cambiá los `href` y los textos de cada botón.
- **Línea de tiempo:** en `index.html`, cada `<li class="tl-item">` es un hito. Cambiá el año, el título y la descripción. Para poner una foto, agregá `<img src="assets/mi-foto.jpg" alt="Descripción">` dentro de `<div class="tl-img">`. Podés sumar o quitar hitos y el ancho se ajusta solo.
- **Efectos:** en `main.js`, objeto `CONFIG`:
  - `hiddenLayer`: `'codigo'` o `'robot'`
  - `transition`: `'tiles'` (cuadrados) o `'laser'`
  - `intro`: pantalla de arranque
  - `perspective`: grados de giro de la cabeza
  - `trailSize`, `autopilot`, `photoScale`, `background`
- **Largo del scroll:** `CONFIG.HERO`, `TL_START`, `TIMELINE` y `CONTACT`, en pantallas. Si los cambiás, actualizá `END` (`TL_START + TIMELINE + CONTACT`) y el `height` de `.story` en `styles.css` (`END + 1` pantallas, en `vh`).

## Publicarlo
Sirve cualquier hosting estático. Arrastrá la carpeta a:
- **Netlify Drop:** app.netlify.com/drop, gratis y sin configurar nada.
- **Vercel** o **Cloudflare Pages:** conectando un repositorio de GitHub.
- **GitHub Pages.**

Después podés conectar tu dominio, por ejemplo adrianoski.dev.

## Pendiente
- Versión para celular: hoy la línea de tiempo y los títulos están pensados para pantalla de computadora.
- Contenido real: años, fotos y textos de la línea de tiempo, línea de presentación y redes.
