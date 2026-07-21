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
console.log(ansi);
```

For canvas security, an external image must permit CORS; local project paths
work when the page is served from the project (rather than opened as `file://`).
Pass an optional CSS `backgroundColor` as the third argument to composite
transparent or semi-transparent pixels before conversion. Without it, fully
transparent 8×8 cells are emitted as reset spaces, so the terminal's background
stays visible. ANSI terminals do not support partial alpha.
