---
titulo: Diapositivas de la exposición — cómo usarlas
tipo: exposicion
tags: [diapositivas, exposicion, leasing, renting]
---

# Diapositivas de la exposición

Son 26 diapositivas en HTML: la ronda 1 (1–13), la entrevista (14–15, con el video animado
dentro) y la ronda 2 (16–26). Funcionan sin internet.

## Ponerlas a andar

1. Abrir una terminal en esta carpeta y ejecutar `python serve.py`. Usa el puerto 8140.
2. Abrir `http://127.0.0.1:8140/diapositivas/` en Chrome o Edge.
3. Presionar **F** para pantalla completa.

No sirve abrir `index.html` con doble clic: el video de la diapositiva 15 necesita el servidor
para cargar y para adelantar o retroceder el audio.

Para empezar en una diapositiva concreta, se agrega su número al final: `…/diapositivas/#15`.

## Teclas

| Tecla | Acción |
|---|---|
| → , Av Pág, Enter o Espacio | Siguiente diapositiva |
| ← , Re Pág o Retroceso | Diapositiva anterior |
| Inicio / Fin | Primera / última diapositiva |
| F | Pantalla completa |

En la diapositiva 15 (el video), **Espacio** o **K** reproduce o pausa, y **J** / **L** mueven
el audio un segundo atrás o adelante. Las flechas siguen pasando de diapositiva, y al salir el
video se pausa solo.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Las 26 diapositivas y los íconos que usan. |
| `deck.css` | Paleta, letra (Manrope), diseño de cada diapositiva y animaciones. |
| `deck.js` | Navegación, cifras que cuentan, barra de avance y control del video. |
| `serve.py` | Servidor local; sirve también `../video-entrevista/`. |
| `img/logo-upb.png` | Logo de la UPB de la portada. |
| `fonts/` | Manrope, con licencia OFL (`OFL.txt`). |
| `tests/run-tests.mjs` | Pruebas en Chrome sin interfaz: `node tests/run-tests.mjs` con el servidor encendido. Revisa que nada se encime ni se salga de la diapositiva, la navegación y las teclas del video. Guarda capturas en `tests/capturas/`. |
