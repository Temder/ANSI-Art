# ANSI-Art
Repo for ANSI-Art mostly for sharing
# Image-to-ANSI helper

`image-to-ansi.js` exposes one browser function, `imageToAnsi(imagePath, width)`,
which returns a promise resolving to true-colour ANSI text. It uses the same
ansi-art.com algorithm: every 8×8 cell is evaluated as a solid, horizontal,
vertical, or quadrant block character and the lowest-error representation is
used.

```js
const ansi = await imageToAnsi('./my-image.png', 120);
const ansiOnBlue = await imageToAnsi('./my-image.png', 120, '#10243d');
// Opt in to diagonal/triangular legacy glyphs (requires a supporting font).
const ansiWithSlopes = await imageToAnsi('./my-image.png', 120, undefined, true);
// Use top and bottom half blocks for a pixel-art result.
const pixelArt = await imageToAnsi('./my-image.png', 120, undefined, false, true);
console.log(ansi);
```

For canvas security, an external image must permit CORS; local project paths
work when the page is served from the project (rather than opened as `file://`).
Pass an optional CSS `backgroundColor` as the third argument to composite
transparent or semi-transparent pixels before conversion. Without it, fully
transparent 8×8 cells are emitted as reset spaces. Partially transparent cells
fit their alpha mask with a block glyph; when necessary the glyph is inverted so
the opaque portion is foreground and its holes show the terminal background.
ANSI terminals do not support partial alpha.
