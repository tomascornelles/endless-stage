# Endless Stage: documento de traspaso

Pega este documento al inicio de una conversación nueva, junto con los archivos que quieras modificar.

## 1. Qué es el proyecto

Juego de rally 3D en el navegador, con una pista infinita generada de forma procedural mientras se conduce. Es una PWA instalable en escritorio y móvil.

- **Idioma del usuario y de la interfaz:** español.
- **Web:** https://endless-stage.netlify.app (la PWA instalada arranca en `play.html`).
- **Stack:** Three.js r128 (cdnjs), JavaScript sin frameworks, Node 18+ para el servidor local y los tests.
- **Carpeta del proyecto:** `endless-stage/`.

## 2. Estructura de archivos

| Archivo | Función |
|---|---|
| `index.html` | Landing informativa con el botón «Correr» que lleva a `play.html`. |
| `play.html` | Simulador: canvas, HUD, pausa, menús con pestañas (Gameplay / Controles), zonas táctiles, panel de depuración. |
| `js/game.js` | Todo el motor: pista, terreno, física, controles, sonido, HUD, decoración. Es el archivo que más cambia. |
| `js/core.js` | Funciones puras probadas en Node: `clamp`, `hills`, `fadeOff`, `bumpAt`, `latEff`, `INNER`. |
| `css/style.css` | Estilos (vidrio líquido, HUD LCD, menús, controles táctiles). Las reglas añadidas al final sobrescriben las anteriores. |
| `sw.js` | Service worker. `VERSION = 'endless-stage-v3'`. Red primero para archivos propios, caché para el CDN. Subir la versión al cambiar archivos que la PWA debe recargar. |
| `manifest.webmanifest` | `start_url: ./play.html`. |
| `assets/manifest.json` | Configuración externa: texturas (listas, se escoge una al azar), `repeat` por textura, `arrows` (SVG), `sounds`, `menuImage`. La clave `people` ya no se usa. |
| `server.js` | Servidor estático en Node, sin dependencias. `npm start` → `http://localhost:8080`. |
| `tests/*.test.js` | `node:test`. `npm test` debe dar 21/21. |
| `package.json` | Scripts `start`, `test`, `deploy` (`npx -y netlify-cli deploy --prod --dir .`). |
| `netlify.toml`, `.netlifyignore` | Despliegue estático sin build. Site ID: `6fbe66f8-ec7b-4d8b-8f5d-6baa6b727f3f`. |

Las texturas y sonidos reales (PNG, JPG, WAV) los pone el usuario en `assets/`; si faltan, el juego usa valores de respaldo.

## 3. Cómo se trabaja en este proyecto

- Los cambios en `js/game.js` se hacen con scripts Python que comprueban cada reemplazo (`assert count == 1`). Después: `node --check js/game.js` y `npm test`.
- Entrega: presentar solo los archivos modificados en cada turno. El usuario lo pide expresamente.
- Herramientas de depuración: `?debug=1` muestra un panel con altura de carretera, suelo y cámara; **V** cambia a vista cenital (100 m); **G** activa invulnerabilidad. Los mensajes de error de texturas o manifiesto solo aparecen en debug.
- Limitación importante: no se puede probar en navegador desde el entorno. El usuario prueba y devuelve capturas y, a veces, trazas de rendimiento (`Trace-*.json`).

## 4. Arquitectura de `js/game.js`

### Pista (generación)
- La pista es un array `pts` de puntos `{x, y, z, h, b, k}`: posición, rumbo, altura, bump de puente (no se usan puentes ya), curvatura. Se generan en `extend(n)`.
- Se consume por **chunks** de `CH = 20` puntos (60 m). Cada chunk construye sus mallas en `buildChunk(c)`.
- **Patrones** (`genPattern`): rectas cortas, curvas de 60°–120° con radio 10–40 m, chicanes, curvas enlazadas. Las curvas se codifican como segmentos `{k, n}` (curvatura objetivo y número de puntos) en `segQueue`.
- **Planificador** (`buildPattern`): genera ~40 candidatos, los simula (`simulate`) y descarta los que se acercan a menos de **20 m** de la pista antigua (excluye los últimos 40 puntos) o que salen del **cono de ±70°** de rumbo. Puntúa por espacio libre (recta de comprobación de 60 puntos) y separación.
- **Monótono:** el rumbo se mantiene en ±70° del eje, sin horquillas de 180°. Es la concesión que evita solapamientos de forma estructural.
- Los puentes y `checkCross` ya no se usan.
- **Altura de la pista:** `roadY(x, z, h)` = máximo del terreno en la huella (calzada + 5 m por lado, muestreada en 15 puntos) + 0,3 m. El plano es uniforme a través de la pista.

### Terreno
- **Teselas** de 500 m, malla de 10 m (`RES = 10`, 50×50 celdas). `tileHeight(x, z)` es analítica (senos), con amplitud regional `A` para zonas más o menos empinadas. Base 45 m.
- Teselas creadas con `ensureAround` (radio 1) alrededor de cada punto de la pista; `cullTiles` las elimina a más de 1600 m.
- Celdas con altura media > 52 m usan material de nieve (grupo 1 del mesh).
- `terrainAt(x, z)` interpola bilinealmente. `groundY(p, a)` es la altura del terreno en un punto lateral.
- **Montañas:** `placeMountain` por tesela (≈35 % de teselas), radio 150–260 m, se retiran con `clearMountains` si la pista pasa a menos de r + 80 m.

### Decoración y obstáculos (en `buildChunk`)
- **Carretera:** plano de la pista (`ribbon`), línea central (solo asfalto), arcén de 5 m por lado al nivel del plano, marcas de neumáticos, baches y charcos.
- **Barreras** (`wallOf`): base en la altura del tablero (`list[i].y - 0.2`), `bot = 0`. Tipos: `rail` (guardarraíl con postes), `wave` (cinta ondulante fina), `stone` (volumen de 0,6 m con tapas), `hay` (bloques rectangulares con huecos y tamaño ±10 %), `tyre` (pilas instanciadas). Tipo elegido por chunk; el 20 % usa `tyre`.
- **Obstáculos:** `addObstacle` (roca, tronco, cono), a un cuarto de la anchura de la pista, 25 % de los chunks.
- **Decoración** fuera de las barreras: árboles low poly (64 variantes, instanciados por variante), personas low poly (64 variantes, instanciadas), casas (solo zona «pueblo») con colores sólidos y tejado nevado en tramos de nieve. Comprobaciones de distancia a otras pistas: árboles > 10 m, personas > 6 m, casas > 15 m.
- Los materiales de pista usan texturas del manifiesto (`pool`): un material por textura, escogido al azar por elemento o por chunk.
- En nieve (`avgY > 52`) la pista usa la textura de nieve; fuera, asfalto, tierra o barro.

### Física y controles
- Modelo de rumbo relativo: `S.rel` (ángulo del coche respecto al trazado), `S.lat` (desplazamiento lateral), `S.p` (progreso en puntos). El rumbo de la pista se resta de `rel` en la cámara.
- Giro: `turn = steer · 2.2 · sens · grip · min(1, v/12)`. Adherencia por terreno y velocidad. **Derrape:** frenar girando reduce el agarre.
- Marcha atrás hasta −15 m/s; el coche no puede pasar de la línea de salida.
- Barreras: `LIM = max(0.2, RW/2 − 0.6)`. Impacto > 30 rompe la barrera. Daño proporcional a velocidad y ángulo.
- **Saltos:** `airPhysics` detecta caídas bruscas del suelo a más de 12 m/s (aceleración < −15 m/s²) y despega. Aterrizaje con daño.
- Modos de control: teclado (WASD/flechas, Espacio), giroscopio (calibración al empezar, permiso iOS al elegir el modo), táctil (zonas de 92 px, acelerador automático). Por defecto táctil si el puntero es grueso.
- Vida inicial 100; al llegar a 0 termina la carrera. Récord en `localStorage` (`endless_stage_best`); aviso «¡Nuevo récord!» bajo el HUD de distancia.

### HUD y avisos
- LCD izquierdo: velocidad (con «· R» en marcha atrás), distancia, récord, barra de daño.
- Avisos centrales (`findItems`): curvas detectadas por la curvatura guardada en `pts[i].k`, con umbral de 0,0025 suavizado en 3 puntos y ángulo mínimo de 1,0 rad (≈57°). Obstáculos como elementos del mismo aviso (⚠). Colores: verde < 90°, amarillo < 135°, rojo ≥ 135°. Se recalcula cada 6 fotogramas.
- Un aviso desaparece al llegar a 0 m, y aparece la siguiente; la segunda va al 50 % debajo.

### Iluminación, sombras y entorno
- Día: hemisferio 0,5, sol cálido 1,5, sombras PCF de 1024 px, tono ACES. Sombras que siguen al coche (±70 m).
- Noche (`setNight`): ambiente al 5 %, sol apagado, faro (SpotLight 12) y foco corto (PointLight 1,5) unidos a la cámara.
- Niebla 200–900 m. Cielo y niebla cambian suavemente según el terreno (solo de día).
- Árboles y personas son mallas 3D (no sprites), con sombra por su propia geometría. Los copas-sombra de la versión anterior ya no existen.

### Sonido
- Síntesis por defecto: motor (sierra + cuadrada filtradas), chasquido de cambio de marcha (5 marchas, cada 14 m/s), ruido de terreno por superficie, choque.
- Si existen archivos en `assets/manifest.json → sounds` (`engine`, `shift`, `terrain` por nombre, `crash`), se usan en su lugar. Motor en bucle con tasa de reproducción según revoluciones.

### Menús (`play.html`)
- Menú de inicio y de pausa con pestañas **Gameplay** (Día/Noche en píldora, sensibilidad no) y **Controles** (modo de control en píldora, sensibilidad de giro). Botón principal (Empezar / Continuar) fijo al pie del menú. «Reiniciar» aparece solo tras empezar a correr. Desenfoque del fondo al abrir menús.
- Estilo de botones: píldora de vidrio, igual que el selector Día/Noche.

## 5. Estado actual (último turno)

Último cambio aplicado y **no verificado en navegador**:
- Plano de pista de 5 m por lado al nivel del trazado.
- Barreras desde la altura del tablero, con `bot = 0`. El usuario reportó que aún se veían bajo el trazado en la captura anterior; la última versión corrige el origen, pero hay que confirmarlo.
- Obstáculos restaurados (se habían quitado sin querer): 25 % de chunks, a ±ROAD_W/4.
- Decoración añadida: árboles y personas instanciados, casas en pueblo.

Tests: 21/21 pasan (`npm test`).

## 6. Problemas abiertos y preguntas pendientes

1. **Barreras:** confirmar en navegador que empiezan sobre el plano. Si hay residuos, revisar `base`/`bot` en `wallOf` y el plano (`ribbon` del arcén) en `buildChunk`.
2. **Decoración en bordes de tesela o de chunk:** la comprobación de distancia usa solo la pista ya generada; una decoración puede quedar cerca de un tramo futuro. Revisar si aparecen casos.
3. **Rendimiento:** la última traza (JS ~4 s, GPU ~5 s en la misma prueba) era aceptable, pero la decoración añade mallas. Siguiente paso previsto: fusionar instancias por chunk y reducir llamadas de dibujo. Pedir una traza nueva antes de optimizar.
4. **Solapamientos:** el diseño monótono (cono ±70°, sin horquillas > 120°) evita cruces de forma estructural, pero no es una garantía formal. Si aparecen, pedir la posición (distancia del aviso) y revisar `simulate`/`buildPattern`.
5. **Montañas:** solo aparecen en teselas cargadas (≈500 m). Si el usuario quiere verlas más lejos, hay que cargar más teselas, con coste.
6. **Clave `people` del manifiesto:** ya no se usa; puede eliminarse.
7. **Avisos de error de texturas/JSON:** solo en debug (decisión del usuario).
8. **Sonido:** si el usuario añade WAV reales, verificar la carga (`decodePending`).

## 7. Preferencias y forma de trabajar del usuario

- Respuestas en español, directas, con cambios concretos. Prefiere que se le diga claramente qué no se puede garantizar y qué concesiones harían falta, en lugar de prometer de más.
- Ha señalado repetidamente soluciones que no funcionaban (terreno sobre la pista, huecos, barreras hundidas). Antes de proponer un arreglo, conviene verificar la causa con los datos del panel de debug.
- Quiere que los cambios se entreguen como archivos modificados, sin reexplicar todo el proyecto.
- Requisitos firmes: nunca solapar trazadas; la pista es un plano continuo que incluye 5 m por lado de arcén; el terreno nunca tapa la calzada; nieve solo en pista sobre terreno nevado; los menús no deben tapar la pantalla de juego.
- Interfaz: poco ruido visual, avisos discretos, mensajes de error técnicos solo en debug.

## 8. Cómo arrancar en una conversación nueva

1. Subir este `HANDOFF.md` y los archivos a tocar (normalmente `js/game.js`, `play.html`, `css/style.css`, `sw.js`).
2. Indicar la petición concreta y, si aplica, la captura con el panel `?debug=1` activo.
3. Pedir siempre: cambio mínimo, comprobación con `node --check` y `npm test`, y entrega de los archivos modificados.
