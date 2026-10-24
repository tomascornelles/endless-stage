# Endless Stage

Juego de rally 3D en el navegador con pista infinita generada de forma procedural.
Web: https://endless-stage.netlify.app

## Requisitos
- Node.js 18 o superior (no hay dependencias externas).

## Uso
```bash
npm start        # servidor local en http://localhost:8080 (variable PORT para cambiarlo)
npm test         # tests unitarios, de servidor y de proyecto (node --test)
```

## Estructura
- `index.html`: marcado, SEO, Open Graph, JSON-LD y registro del Service Worker.
- `css/style.css`: interfaz de cristal y controles táctiles.
- `js/core.js`: funciones puras (relieve, puentes, utilidades), probadas en Node.
- `js/game.js`: motor, pista procedural, física y controles.
- `server.js`: servidor estático en Node, sin dependencias.
- `sw.js`: caché offline del juego y de Three.js.
- `manifest.webmanifest`: instalación como app (PWA).
- `icons/`, `favicon.svg`: iconos y favicon.
- `robots.txt`, `sitemap.xml`: indexación.
- `tests/`: tests con `node:test`.
- `netlify.toml`: configuración de despliegue estático.

## Despliegue
Netlify publica la carpeta raíz tal cual, sin build.
