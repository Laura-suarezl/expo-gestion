---
titulo: Video animado de la entrevista — cómo usarlo
tipo: exposicion
tags: [entrevista, video, leasing, renting]
---

# Video animado de la entrevista

La página reproduce el audio de la entrevista (`media/entrevista.m4a`, 4:51) y dibuja, al ritmo
de la voz, lo que va diciendo el profesor. Funciona sin internet.

## Ponerlo a andar

En la exposición el video va dentro de las diapositivas, en la diapositiva 15 (ver
`../diapositivas/LEEME.md`). Para verlo solo:

1. Abrir una terminal en esta carpeta y ejecutar `python serve.py`. Usa el puerto 8137 y acepta
   las peticiones Range que necesita el audio para adelantar y retroceder.
2. Abrir `http://127.0.0.1:8137/` en Chrome o Edge.
3. Presionar **F** para pantalla completa y luego **clic** o **espacio** para empezar.

El servidor de las diapositivas también lo sirve, en `http://127.0.0.1:8140/video-entrevista/`.

No sirve abrir `index.html` con doble clic ni usar `python -m http.server`: sin Range, el audio no
se puede mover y las teclas J y L fallan.

## Teclas

| Tecla | Acción |
|---|---|
| Espacio, K o clic | Reproducir o pausar |
| J / L | Un segundo atrás / adelante |
| F | Pantalla completa |

Dentro de las diapositivas, las flechas y F manejan la presentación, no el video.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Las 12 escenas. Cada escena declara su rango (`data-from`, `data-to`) y cada elemento su segundo de entrada (`data-in`) y, si la tiene, de salida (`data-out`). Para corregir un tiempo se cambia ahí; la lógica no se toca. |
| `video.js` | Calcula el estado de la pantalla a partir de `audio.currentTime`. |
| `video.css` | Estilo y animaciones, con la misma paleta y la misma letra (Manrope) de las diapositivas. |
| `escenas.md` | El guion de escenas con el segundo de cada palabra clave. |
| `tests/run-tests.mjs` | Pruebas en Chrome sin interfaz: `node tests/run-tests.mjs` con el servidor encendido. Sale con código 1 si algo falla y guarda capturas en `tests/capturas/`. |
| `fonts/` | Manrope (`Manrope-wght.ttf`, licencia OFL en `OFL-Manrope.txt`). Los archivos IM Fell y Old Standard son del diseño anterior y ya no se cargan. |

## Pendiente

La palabra final de la escena 9 (alrededor de 4:10) no está confirmada: «más barato», «más
maravilloso» o «más bueno». Por eso en pantalla esa escena cierra sin palabra, solo con el
cambio de la comparación.
