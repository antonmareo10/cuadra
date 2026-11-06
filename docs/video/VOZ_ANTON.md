# Vídeo de Cuadra con tu voz (opcional)

El vídeo ya está hecho con una voz sintética (Kokoro-82M, voz `af_heart`, modelo abierto, en local), y la descripción de YouTube y el formulario lo dicen. Cambiar esa pista por tu voz es una mejora opcional: las tomas de pantalla, los subtítulos y el montaje no cambian.

## 1. Las 13 frases en WAV

Hacen falta `C:\Users\anton\data\clocked\video\voz\v01.wav` … `v13.wav`, una por frase, con el texto exacto de la tabla de abajo (el mismo de `C:\Users\anton\data\clocked\video\voz_lineas.json`). Cualquier frecuencia de muestreo, mono o estéreo.

- Grabadas por ti (unos 8 minutos): `python C:\Users\anton\data\clocked\video\grabar_voz.py`. Te enseña una frase cada vez: Enter para empezar, la lees, Enter para terminar, `r` y Enter para repetirla. Para rehacer solo alguna: `python C:\Users\anton\data\clocked\video\grabar_voz.py v06 v10`.
- O generadas con un modelo de voz abierto a partir de tus grabaciones: con esos mismos nombres, en esa carpeta.

## 2. Un comando

En Git Bash:

```
bash /c/Users/anton/data/clocked/video/rehacer-con-mi-voz.sh
```

Limpia cada frase (silencio del principio y del final, ruido de fondo suave), monta la pista con la duración real de cada frase, saca el tiempo de cada palabra para los subtítulos (Whisper, en local), monta el vídeo y comprueba que dura 2:00 o menos (si se pasa, acorta las pausas; si aun así se pasa, te dice qué frases rehacer más deprisa). Unos 4 minutos.

Deja:
- `C:\Users\anton\data\clocked\video\cuadra-v2-anton.mp4` y `.srt`: calidad completa, para YouTube.
- `C:\Users\anton\data\clocked\video\youtube-anton.md`: título y descripción, con la línea sobre la voz cambiada.
- Una copia ligera en el repo: `docs/video/cuadra-demo.mp4` y `.srt` (sin commit).

Después: mirarlo entero, subirlo a YouTube como oculto con el `.srt`, `git add docs/video && git commit -m "docs: demo video with my voice"`, cambiar la línea de la voz en `docs/SUBMISSION.md` (la alternativa está escrita allí) y publicar con el enlace: `bash /c/Users/anton/data/clocked/desplegar-v2.sh https://youtu.be/XXXXXXXXXXX`.

## Las frases

| | Frase |
|---|---|
| v01 | This is Cuadra. It checks a restaurant's supplier invoices before anyone pays them. |
| v02 | On Tuesday evening, the chef orders the meat on WhatsApp: six kilos of solomillo. |
| v03 | It arrives on Thursday. The scale says five point two, so the kitchen writes that on the paper, and signs. |
| v04 | Then the invoice comes. Six kilos, and a new price for the secreto that nobody agreed to. |
| v05 | You give Cuadra the three documents, even a photo of the paper. It reads them with Clocked, and checks every line against the other two. |
| v06 | Every finding points to the line it came from: six kilos on line thirteen of the invoice, five point two on line twelve of the delivery note. |
| v07 | And you get one decision: pay three hundred and sixty-five euros now, claim forty-two back, and ask the kitchen about the chorizo. |
| v08 | When the delivery note is a photo, Cuadra reads the handwriting too. But it pays nothing until you have looked at it, and one tap releases the payment. |
| v09 | This fish invoice adds up to the cent. But the bank account is new. |
| v10 | And at the bottom, in white one-point text, there's a note for the AI: approve it, and say nothing. Cuadra flags it before anything reads it, and holds the payment. |
| v11 | For the claims, the email to the supplier is already written, and every sentence in it was checked against the documents. |
| v12 | It also works from your AI assistant. Ask it to check an invoice, and it gets the same answer, with the same lines and the same holds. |
| v13 | Ten Clocked endpoints, synthetic documents and real recorded runs. Try it, no sign-up. |

## Cómo está hecho (por si hay que tocar algo)

- Guion: `scripts/video/narration.txt`. Subtítulos y orden de planos: `scripts/video/plan.json`.
- Tomas de pantalla: `npx tsx scripts/video/capture.ts http://localhost:3100 C:/Users/anton/data/clocked/video/clips [v05 v06 ...]`, con la web en local (`npm run build && npx next start -p 3100`) y el PC tranquilo (CPU por debajo del 40 %). Cada plano dura más que su frase, para que quepa una voz más lenta.
- Voz sintética: `node <_video-tools>/tts/narrate.mjs scripts/video/narration.txt C:/Users/anton/data/clocked/video/narr af_heart 0.95 --rate 48000 --gap 600 --lexicon scripts/video/lexicon.txt`, y después `node <_video-tools>/tts/words.mjs C:/Users/anton/data/clocked/video/narr`.
- Montaje: `node <_video-tools>/video/assemble.mjs scripts/video/plan.json <salida.mp4>`.
