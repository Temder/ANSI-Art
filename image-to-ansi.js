/**
 * Converts an image URL/path to ANSI art with the same cell-selection algorithm
 * used by ansi-art.com. Each 8x8 pixel cell is represented by whichever solid,
 * horizontal, vertical, or quadrant block character has the lowest RGB error.
 *
 * @param {string} imagePath A relative path, URL, or data URL for an image.
 * @param {number} width Number of terminal character columns to generate.
 * @param {string} [backgroundColor] CSS color used behind transparent pixels.
 * @returns {Promise<string>} ANSI escape-code text (24-bit colour).
 */
async function imageToAnsi(imagePath, width, backgroundColor) {
  if (!Number.isInteger(width) || width < 1) {
    throw new TypeError('width must be a positive integer.');
  }

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`Could not load image: ${imagePath}`));
    image.src = imagePath;
  });

  const rows = Math.max(1, Math.round(width * (image.naturalHeight / image.naturalWidth) * 0.5));
  const cellSize = 8;
  const pixelWidth = width * cellSize;
  const pixelHeight = rows * cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  let source;
  try {
    source = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    throw new Error(`Unable to read image pixels for "${imagePath}". Use a same-origin image or enable CORS.`, { cause: error });
  }

  let background = null;
  if (backgroundColor !== undefined) {
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
    colorContext.fillStyle = '#000000';
    colorContext.fillStyle = backgroundColor;
    colorContext.fillRect(0, 0, 1, 1);
    background = colorContext.getImageData(0, 0, 1, 1).data;
  }

  // ansi-art.com resizes by nearest-neighbour sampling, before evaluating cells.
  const pixels = new Uint8ClampedArray(pixelWidth * pixelHeight * 4);
  const scaleX = source.width / pixelWidth;
  const scaleY = source.height / pixelHeight;
  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const from = (Math.floor(y * scaleY) * source.width + Math.floor(x * scaleX)) * 4;
      const to = (y * pixelWidth + x) * 4;
      const alpha = source.data[from + 3] / 255;
      if (background) {
        pixels[to] = Math.round(source.data[from] * alpha + background[0] * (1 - alpha));
        pixels[to + 1] = Math.round(source.data[from + 1] * alpha + background[1] * (1 - alpha));
        pixels[to + 2] = Math.round(source.data[from + 2] * alpha + background[2] * (1 - alpha));
        pixels[to + 3] = 255;
      } else {
        pixels[to] = source.data[from];
        pixels[to + 1] = source.data[from + 1];
        pixels[to + 2] = source.data[from + 2];
        pixels[to + 3] = source.data[from + 3];
      }
    }
  }

  const horizontal = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  // Upper fractional blocks complement `horizontal`, including Unicode's
  // Symbols for Legacy Computing glyphs for the 2/8, 3/8, 5/8, 6/8, and 7/8 fills.
  const upperHorizontal = [' ', '▔', '🮂', '🮃', '🮄', '▀', '🮅', '🮆', '█'];
  const vertical = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
  const quadrants = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
  const escape = '\\x1b[';
  // Pixels below this are rendered as holes. Near-opaque values are common in
  // exported PNGs and should retain normal colour-based glyph fitting.
  const transparentAlpha = 128;

  const inverse = {
    '▛': '▗', '▜': '▖', '▙': '▝', '▟': '▘', '▞': '▚',
    '▔': '▇', '🮂': '▆', '🮃': '▅', '▀': '▄', '🮄': '▃', '🮅': '▂', '🮆': '▁',
    '▏': '🮋', '▎': '🮊', '▍': '🮉', '▌': '▐', '▋': '🮈', '▊': '🮇', '▉': '🭵',
  };
  // The table above is written in one direction; make it usable whichever
  // side of a fitted shape happened to contain the transparent pixels.
  for (const [shape, opposite] of Object.entries(inverse)) inverse[opposite] = shape;

  const stats = (x0, y0, x1, y1) => {
    let r = 0, g = 0, b = 0, rr = 0, gg = 0, bb = 0;
    const count = (x1 - x0) * (y1 - y0);
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const offset = (y * pixelWidth + x) * 4;
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      r += red; g += green; b += blue;
      rr += red * red; gg += green * green; bb += blue * blue;
    }
    return { count, r, g, b, rr, gg, bb };
  };
  const alpha = (x0, y0, x1, y1) => {
    let total = 0;
    const count = (x1 - x0) * (y1 - y0);
    for (let pixelY = y0; pixelY < y1; pixelY += 1) for (let pixelX = x0; pixelX < x1; pixelX += 1) {
      total += pixels[(pixelY * pixelWidth + pixelX) * 4 + 3];
    }
    return total / count;
  };
  const color = value => [Math.round(value.r / value.count), Math.round(value.g / value.count), Math.round(value.b / value.count)];
  const error = value => value.rr - value.r * value.r / value.count + value.gg - value.g * value.g / value.count + value.bb - value.b * value.b / value.count;
  const join = (a, b) => ({
    count: a.count + b.count, r: a.r + b.r, g: a.g + b.g, b: a.b + b.b,
    rr: a.rr + b.rr, gg: a.gg + b.gg, bb: a.bb + b.bb,
  });

  const bestCell = (column, row) => {
    const x = column * cellSize, y = row * cellSize;
    let fullyTransparent = true;
    let hasTransparentPixels = false;
    for (let pixelY = y; pixelY < y + cellSize; pixelY += 1) {
      for (let pixelX = x; pixelX < x + cellSize; pixelX += 1) {
        const pixelAlpha = pixels[(pixelY * pixelWidth + pixelX) * 4 + 3];
        if (pixelAlpha !== 0) fullyTransparent = false;
        if (pixelAlpha < transparentAlpha) hasTransparentPixels = true;
      }
    }
    // ANSI has no alpha. A reset space leaves the terminal's existing
    // background visible, which preserves completely transparent areas.
    if (fullyTransparent) return { transparent: true };

    const full = stats(x, y, x + 8, y + 8);
    const fullAlpha = alpha(x, y, x + 8, y + 8);
    const candidates = [{ char: '█', fg: color(full), bg: color(full), fgAlpha: fullAlpha, bgAlpha: fullAlpha, fgPixels: 64, bgPixels: 0, error: error(full) }];

    for (let fill = 0; fill <= 8; fill += 1) {
      const top = fill < 8 ? stats(x, y, x + 8, y + 8 - fill) : null;
      const bottom = fill > 0 ? stats(x, y + 8 - fill, x + 8, y + 8) : null;
      const fg = bottom || top;
      const bg = top || bottom;
      candidates.push({
        char: horizontal[fill], fg: color(fg), bg: color(bg),
        fgAlpha: bottom ? alpha(x, y + 8 - fill, x + 8, y + 8) : alpha(x, y, x + 8, y + 8 - fill),
        bgAlpha: top ? alpha(x, y, x + 8, y + 8 - fill) : alpha(x, y + 8 - fill, x + 8, y + 8),
        fgPixels: fill * 8, bgPixels: (8 - fill) * 8,
        error: (top ? error(top) : 0) + (bottom ? error(bottom) : 0),
      });

      const left = fill > 0 ? stats(x, y, x + fill, y + 8) : null;
      const right = fill < 8 ? stats(x + fill, y, x + 8, y + 8) : null;
      const leftFg = left || right;
      const rightBg = right || left;
      candidates.push({
        char: vertical[fill], fg: color(leftFg), bg: color(rightBg),
        fgAlpha: left ? alpha(x, y, x + fill, y + 8) : alpha(x + fill, y, x + 8, y + 8),
        bgAlpha: right ? alpha(x + fill, y, x + 8, y + 8) : alpha(x, y, x + fill, y + 8),
        fgPixels: fill * 8, bgPixels: (8 - fill) * 8,
        error: (left ? error(left) : 0) + (right ? error(right) : 0),
      });

      // The standard block range only provides lower eighths. These upper
      // eighths let a transparent lower region remain a true glyph hole.
      const upper = fill > 0 ? stats(x, y, x + 8, y + fill) : null;
      const lower = fill < 8 ? stats(x, y + fill, x + 8, y + 8) : null;
      const upperFg = upper || lower;
      const lowerBg = lower || upper;
      candidates.push({
        char: upperHorizontal[fill], fg: color(upperFg), bg: color(lowerBg),
        fgAlpha: upper ? alpha(x, y, x + 8, y + fill) : alpha(x, y + fill, x + 8, y + 8),
        bgAlpha: lower ? alpha(x, y + fill, x + 8, y + 8) : alpha(x, y, x + 8, y + fill),
        fgPixels: fill * 8, bgPixels: (8 - fill) * 8,
        error: (upper ? error(upper) : 0) + (lower ? error(lower) : 0),
      });
    }

    const parts = [
      stats(x, y, x + 4, y + 4), stats(x + 4, y, x + 8, y + 4),
      stats(x, y + 4, x + 4, y + 8), stats(x + 4, y + 4, x + 8, y + 8),
    ];
    for (let mask = 0; mask < 16; mask += 1) {
      let foreground = null, background = null;
      for (let part = 0; part < 4; part += 1) {
        if (mask & (1 << part)) foreground = foreground ? join(foreground, parts[part]) : parts[part];
        else background = background ? join(background, parts[part]) : parts[part];
      }
      const fg = foreground || background;
      const bg = background || foreground;
      const foregroundParts = [], backgroundParts = [];
      for (let part = 0; part < 4; part += 1) {
        const partX = x + (part % 2) * 4, partY = y + Math.floor(part / 2) * 4;
        (mask & (1 << part) ? foregroundParts : backgroundParts).push(alpha(partX, partY, partX + 4, partY + 4));
      }
      const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
      candidates.push({
        char: quadrants[mask], fg: color(fg), bg: color(bg),
        fgAlpha: foregroundParts.length ? average(foregroundParts) : average(backgroundParts),
        bgAlpha: backgroundParts.length ? average(backgroundParts) : average(foregroundParts),
        fgPixels: foregroundParts.length * 16, bgPixels: backgroundParts.length * 16,
        error: (foreground ? error(foreground) : 0) + (background ? error(background) : 0),
      });
    }

    const transparencyError = candidate => candidate.fgPixels * (255 - candidate.fgAlpha) ** 2 + candidate.bgPixels * candidate.bgAlpha ** 2;
    const best = candidates.reduce((best, candidate) => {
      const candidateError = !background && hasTransparentPixels ? transparencyError(candidate) : candidate.error;
      const bestError = !background && hasTransparentPixels ? transparencyError(best) : best.error;
      return candidateError < bestError ? candidate : best;
    });
    // A terminal has no alpha channel. For cells containing transparent source
    // pixels, draw only the more-opaque half of the fitted shape and leave its
    // complement as the terminal's own background. If the transparent half was
    // selected as foreground, flip the glyph and use the opposite colour.
    if (!background && hasTransparentPixels) {
      if (best.fgAlpha < best.bgAlpha && inverse[best.char]) {
        return { char: inverse[best.char], fg: best.bg, transparentBackground: true };
      }
      return { char: best.char, fg: best.fg, transparentBackground: true };
    }
    return best;
  };

  let ansi = '';
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const cell = bestCell(column, row);
      if (cell.transparent) {
        ansi += ' ';
        continue;
      }
      if (cell.transparentBackground) ansi += `${escape}0m`;
      ansi += `${escape}38;2;${cell.fg[0]};${cell.fg[1]};${cell.fg[2]}m`; // foreground color
      if (cell.bg) {
        ansi += `${escape}48;2;${cell.bg[0]};${cell.bg[1]};${cell.bg[2]}m`; // background color
      }
      ansi += cell.char // character
    }
    ansi += `${escape}0m\n`;
  }
  ansi = ansi.replace(/ +/g, `${escape}0m$&`);
  return ansi;
}

window.imageToAnsi = imageToAnsi;
