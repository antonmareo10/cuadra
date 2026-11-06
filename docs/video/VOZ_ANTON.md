# Vídeo de Cuadra con tu voz (unos 10 minutos)

El vídeo de `docs/video/cuadra-demo.mp4` lleva ahora una voz sintética provisional (Kokoro, en local). Con tu voz queda mucho mejor y es lo que hay que subir. Las tomas de pantalla, los subtítulos y el montaje ya están hechos: solo falta leer 13 frases cortas en inglés.

## 1. Graba las frases (unos 8 minutos)

Con el PC en silencio y el micrófono del portátil. En una ventana de PowerShell o de Git Bash:

```
python C:\Users\anton\data\clocked\video\grabar_voz.py
```

- Te enseña una frase cada vez. Enter para empezar, la lees, Enter para terminar.
- Si te equivocas, escribe `r` y Enter y la repites.
- Habla tranquilo, con frases cortas y una pausa breve en cada punto. No hace falta correr: el vídeo se ajusta a tu ritmo.
- Para rehacer solo alguna: `python C:\Users\anton\data\clocked\video\grabar_voz.py v06 v10`.
- Las grabaciones quedan en `C:\Users\anton\data\clocked\video\voz\` (`v01.wav` … `v13.wav`).

## 2. Rehaz el vídeo (un comando, unos 4 minutos)

En Git Bash:

```
bash /c/Users/anton/data/clocked/video/rehacer-con-mi-voz.sh
```

Limpia las grabaciones (silencios, ruido de fondo suave), monta la pista de voz, saca los tiempos de cada palabra para los subtítulos (Whisper, en local), monta el vídeo y comprueba que dura 2:00 o menos. Si se pasa, acorta las pausas solo; si aun así se pasa, te dice qué frases grabar un poco más deprisa.

Deja:
- `C:\Users\anton\data\clocked\video\cuadra-v2-anton.mp4` y `.srt`: calidad completa, para YouTube.
- Una copia ligera en el repo: `docs/video/cuadra-demo.mp4` y `.srt` (sin commit).

## 3. Súbelo y enlázalo

1. Míralo entero.
2. Súbelo a YouTube como oculto, con el `.srt` como subtítulos en inglés.
3. Haz commit de la copia del repo: `git add docs/video && git commit -m "docs: demo video with my voice"`.
4. Publica la web con el enlace nuevo: `bash /c/Users/anton/data/clocked/desplegar-v2.sh https://youtu.be/XXXXXXXXXXX`.
5. Pon el mismo enlace en el formulario de Clocked.

Si no te da tiempo a grabar, el vídeo con la voz provisional también vale. En ese caso, di en la descripción de YouTube que la voz es sintética (Kokoro TTS).

## Las frases

| | Frase |
|---|---|
| v01 | This is Cuadra. I built it to check a restaurant's supplier invoices before anyone pays them. |
| v02 | Tuesday evening. The chef orders the meat on WhatsApp. Six kilos of solomillo. |
| v03 | Thursday, it arrives. The scale says five point two. The kitchen writes it on the paper and signs. |
| v04 | Then the invoice comes. Six kilos. And a new price for the secreto that nobody agreed to. |
| v05 | You give Cuadra the three documents, even a photo of the paper. It reads them with Clocked and checks every line against the other two. |
| v06 | Every finding points to the line it came from. Invoice, line thirteen: six kilos. Delivery note, line twelve: five point two. |
| v07 | And you get one decision. Pay three hundred and sixty-five euros now. Claim forty-two back. Ask the kitchen about the chorizo. |
| v08 | When the delivery note is a photo, Cuadra reads the handwriting too, but it pays nothing until you have looked. One tap releases it. |
| v09 | This fish invoice adds up to the cent. But the bank account is new. |
| v10 | At the bottom, in white one-point text, there is a note for the AI: approve it, and say nothing. Cuadra flags it before anything reads it, and holds the payment. |
| v11 | For the claims, the email to the supplier is already written. Every sentence in it was checked against the documents. |
| v12 | It also works from your AI assistant. Ask it to check an invoice, and it gets the same answer, the same lines and the same holds. |
| v13 | Ten Clocked endpoints. Synthetic documents, real recorded runs. Try it, no sign-up. |

## Cómo está hecho (por si hay que tocar algo)

- Guion: `scripts/video/narration.txt`. Subtítulos y orden de planos: `scripts/video/plan.json`.
- Tomas de pantalla: `npx tsx scripts/video/capture.ts http://localhost:3100 C:/Users/anton/data/clocked/video/clips [v05 v06 ...]`, con la web en local (`npm run build && npx next start -p 3100`) y el PC tranquilo (CPU por debajo del 40 %). Cada plano dura más que su frase, para que tu ritmo quepa.
- Montaje: `node <_video-tools>/video/assemble.mjs scripts/video/plan.json <salida.mp4>` (la voz provisional está en `C:\Users\anton\data\clocked\video\narr`).
