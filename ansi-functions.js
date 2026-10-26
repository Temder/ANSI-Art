/**
 * Converts an image URL/path to ANSI art with the same cell-selection algorithm
 * used by ansi-art.com. Each 8x8 pixel cell is represented by whichever solid,
 * horizontal, vertical, or quadrant block character has the lowest RGB error.
 *
 * @param {string} imagePath A relative path, URL, or data URL for an image.
 * @param {number} width Number of terminal character columns to generate.
 * @param {string} [backgroundColor] CSS color used behind transparent pixels.
 * @param {boolean} [enableSlopes=false] Include Symbols for Legacy Computing
 *   diagonal and triangular block glyphs, which are unsupported by some fonts.
 * @returns {Promise<string>} ANSI escape-code text (24-bit colour).
 */
async function imageToAnsi(imagePath, width, backgroundColor, enableSlopes = false) {
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
  const upperHorizontal = [' ', '▔', '🮂', '🮃', '▀', '🮄', '🮅', '🮆', '█'];
  const vertical = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
  // Right fractional blocks complement `vertical`. The glyphs are ordered by
  // the width of the filled area, rather than Unicode code-point order.
  const rightVertical = [' ', '▕', '🮇', '🮈', '▐', '🮉', '🮊', '🮋', '█'];
  const quadrants = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
  // These Symbols for Legacy Computing glyphs are deliberately opt-in: many
  // terminal/font combinations do not contain them. Each polygon describes
  // the foreground region within an 8x8 cell.
  const slope = (char, corner, a, b) => ({ char, points: [a, b, corner] });
  const upperLeft = [0, 0], upperRight = [8, 0], lowerLeft = [0, 8], lowerRight = [8, 8];
  const slopes = [
    slope('🬼', lowerLeft, [0, 6], [4, 8]), slope('🬽', lowerLeft, [0, 6], [8, 8]), slope('🬾', lowerLeft, [0, 2], [4, 8]), slope('🬿', lowerLeft, [0, 2], [8, 8]), slope('🭀', lowerLeft, [0, 0], [4, 8]),
    slope('🭇', lowerRight, [4, 8], [8, 6]), slope('🭈', lowerRight, [0, 8], [8, 6]), slope('🭉', lowerRight, [4, 8], [8, 2]), slope('🭊', lowerRight, [0, 8], [8, 2]), slope('🭋', lowerRight, [4, 8], [8, 0]),
    slope('🭗', upperLeft, [0, 2], [4, 0]), slope('🭘', upperLeft, [0, 2], [8, 0]), slope('🭙', upperLeft, [0, 6], [4, 0]), slope('🭚', upperLeft, [0, 6], [8, 0]), slope('🭛', upperLeft, [0, 8], [4, 0]),
    slope('🭢', upperRight, [4, 0], [8, 2]), slope('🭣', upperRight, [0, 0], [8, 2]), slope('🭤', upperRight, [4, 0], [8, 6]), slope('🭥', upperRight, [0, 0], [8, 6]), slope('🭦', upperRight, [4, 0], [8, 8]),
    slope('🭁', lowerRight, [0, 2], [4, 0]), slope('🭂', lowerRight, [0, 2], [8, 0]), slope('🭃', lowerRight, [0, 6], [4, 0]), slope('🭄', lowerRight, [0, 6], [8, 0]), slope('🭅', lowerRight, [0, 8], [4, 0]), slope('🭆', lowerRight, [0, 6], [8, 2]),
    slope('🭌', lowerLeft, [4, 0], [8, 2]), slope('🭍', lowerLeft, [0, 0], [8, 2]), slope('🭎', lowerLeft, [4, 0], [8, 6]), slope('🭏', lowerLeft, [0, 0], [8, 6]), slope('🭐', lowerLeft, [4, 0], [8, 8]), slope('🭑', lowerLeft, [0, 2], [8, 6]),
    slope('🭒', upperRight, [0, 6], [4, 8]), slope('🭓', upperRight, [0, 6], [8, 8]), slope('🭔', upperRight, [0, 2], [4, 8]), slope('🭕', upperRight, [0, 2], [8, 8]), slope('🭖', upperRight, [0, 0], [4, 8]), slope('🭜', upperLeft, [0, 6], [8, 2]),
    slope('🭝', upperLeft, [4, 8], [8, 6]), slope('🭞', upperLeft, [0, 8], [8, 6]), slope('🭟', upperLeft, [4, 8], [8, 2]), slope('🭠', upperLeft, [0, 8], [8, 2]), slope('🭡', upperLeft, [4, 8], [8, 0]), slope('🭧', upperRight, [0, 2], [8, 6]),
    { char: '🭨', points: [upperLeft, upperRight, lowerRight, lowerLeft, [4, 4]] }, { char: '🭩', points: [upperLeft, [4, 4], upperRight, lowerRight, lowerLeft] }, { char: '🭪', points: [upperLeft, upperRight, [4, 4], lowerRight, lowerLeft] }, { char: '🭫', points: [upperLeft, upperRight, lowerRight, [4, 4], lowerLeft] },
    { char: '🭬', points: [upperLeft, lowerLeft, [4, 4]] }, { char: '🭭', points: [upperLeft, upperRight, [4, 4]] }, { char: '🭮', points: [upperRight, lowerRight, [4, 4]] }, { char: '🭯', points: [lowerLeft, lowerRight, [4, 4]] },
  ].map(shape => {
    const mask = [];
    for (let pixelY = 0; pixelY < 8; pixelY += 1) for (let pixelX = 0; pixelX < 8; pixelX += 1) {
      const pointX = pixelX + 0.5, pointY = pixelY + 0.5;
      let inside = false;
      for (let index = 0, previous = shape.points.length - 1; index < shape.points.length; previous = index, index += 1) {
        const [x1, y1] = shape.points[index], [x2, y2] = shape.points[previous];
        if ((y1 > pointY) !== (y2 > pointY) && pointX < (x2 - x1) * (pointY - y1) / (y2 - y1) + x1) inside = !inside;
      }
      mask.push(inside);
    }
    return { char: shape.char, mask };
  });
  const escape = '\\x1b[';
  // Pixels below this are rendered as holes. Near-opaque values are common in
  // exported PNGs and should retain normal colour-based glyph fitting.
  const transparentAlpha = 10;

  const inverse = {
    '▛': '▗', '▜': '▖', '▙': '▝', '▟': '▘', '▞': '▚', // 3 quadrants and diagonal
    '▔': '▇', '🮂': '▆', '🮃': '▅', '▀': '▄', '🮄': '▃', '🮅': '▂', '🮆': '▁', // horizontal
    '▏': '🮋', '▎': '🮊', '▍': '🮉', '▌': '▐', '▋': '🮈', '▊': '🮇', '▉': '▕', // vertical
    '🬼': '🭒', '🬽': '🭓', '🬾': '🭔', '🬿': '🭕', '🭀': '🭖', 
    '🭇': '🭝', '🭈': '🭞', '🭉': '🭟', '🭊': '🭠', '🭋': '🭡', 
    '🭗': '🭁', '🭘': '🭂', '🭙': '🭃', '🭚': '🭄', '🭛': '🭅', 
    '🭢': '🭌', '🭣': '🭍', '🭤': '🭎', '🭥': '🭏', '🭦': '🭐', 
    //'🭨': '🭬', '🭩': '🭭', '🭪': '🭮', '🭫': '🭯',
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
  const maskedStats = (x, y, mask) => {
    const foreground = { count: 0, r: 0, g: 0, b: 0, rr: 0, gg: 0, bb: 0 };
    const background = { count: 0, r: 0, g: 0, b: 0, rr: 0, gg: 0, bb: 0 };
    let foregroundAlpha = 0, backgroundAlpha = 0;
    for (let pixelY = 0; pixelY < 8; pixelY += 1) for (let pixelX = 0; pixelX < 8; pixelX += 1) {
      const offset = ((y + pixelY) * pixelWidth + x + pixelX) * 4;
      const target = mask[pixelY * 8 + pixelX] ? foreground : background;
      target.count += 1;
      target.r += pixels[offset]; target.g += pixels[offset + 1]; target.b += pixels[offset + 2];
      target.rr += pixels[offset] ** 2; target.gg += pixels[offset + 1] ** 2; target.bb += pixels[offset + 2] ** 2;
      if (target === foreground) foregroundAlpha += pixels[offset + 3];
      else backgroundAlpha += pixels[offset + 3];
    }
    return {
      foreground, background,
      foregroundAlpha: foregroundAlpha / foreground.count,
      backgroundAlpha: backgroundAlpha / background.count,
    };
  };

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

      const rightFilled = fill > 0 ? stats(x + 8 - fill, y, x + 8, y + 8) : null;
      const leftEmpty = fill < 8 ? stats(x, y, x + 8 - fill, y + 8) : null;
      const rightFg = rightFilled || leftEmpty;
      const leftBg = leftEmpty || rightFilled;
      candidates.push({
        char: rightVertical[fill], fg: color(rightFg), bg: color(leftBg),
        fgAlpha: rightFilled ? alpha(x + 8 - fill, y, x + 8, y + 8) : alpha(x, y, x + 8 - fill, y + 8),
        bgAlpha: leftEmpty ? alpha(x, y, x + 8 - fill, y + 8) : alpha(x + 8 - fill, y, x + 8, y + 8),
        fgPixels: fill * 8, bgPixels: (8 - fill) * 8,
        error: (rightFilled ? error(rightFilled) : 0) + (leftEmpty ? error(leftEmpty) : 0),
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

    // With transparent pixels, restrict this to the few slopes with exact
    // inverse glyphs; the rest cannot preserve holes in the terminal output.
    if (enableSlopes) {
      for (const slope of slopes) {
        if (!background && hasTransparentPixels && !inverse[slope.char]) continue;
        const fit = maskedStats(x, y, slope.mask);
        candidates.push({
          char: slope.char, fg: color(fit.foreground), bg: color(fit.background),
          fgAlpha: fit.foregroundAlpha, bgAlpha: fit.backgroundAlpha,
          fgPixels: fit.foreground.count, bgPixels: fit.background.count,
          error: error(fit.foreground) + error(fit.background),
        });
      }
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

// ANSI file decoding and canvas display. Kept here with imageToAnsi so this
// script is the single public entry point for creating and displaying ANSI art.
const ANSI_BLOCKS = {
  '\u2594': 'upper1', '\u{1FB82}': 'upper2', '\u{1FB83}': 'upper3', '\u2580': 'upper',
  '\u{1FB84}': 'upper5', '\u{1FB85}': 'upper6', '\u{1FB86}': 'upper7', '\u2581': 'lower1',
  '\u2582': 'lower2', '\u2583': 'lower3', '\u2584': 'lower', '\u2585': 'lower5',
  '\u2586': 'lower6', '\u2587': 'lower7', '\u2588': 'full', '\u258C': 'left',
  '\u2590': 'right', '\u2591': 'shade1', '\u2592': 'shade2', '\u2593': 'shade3',
};

const CP437 = (() => {
  const table = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f' +
    '\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f' +
    ' !"#$%&\'()*+,-./0123456789:;<=>?' +
    '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_' +
    '`abcdefghijklmnopqrstuvwxyz{|}~\x7f' +
    '\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5' +
    '\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192' +
    '\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb' +
    '\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510' +
    '\u2514\u2534\u252c\u251c\u2500\u253c\u2565\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c' +
    '\u2567\u2568\u2564\u256a\u256b\u2593\u2518\u250c\u2588\u2584\u258c\u2590\u2580' +
    '\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u03bc\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229' +
    '\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0 ';
  return Object.fromEntries([...table].map((character, index) => [index, character]));
})();

const U2C1252 = {
  0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,
  0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,
  0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,
  0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F,
};

function fixMojibake(text) {
  const bytes = [];
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code <= 0x7F) bytes.push(code);
    else if (U2C1252[code] !== undefined) bytes.push(U2C1252[code]);
    else if (code >= 0xA0 && code <= 0xFF) bytes.push(code);
    else bytes.push(0x3F);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}

function decCP437(buffer) {
  return [...new Uint8Array(buffer)].map(byte => CP437[byte] || '?').join('');
}

function decodeBuf(buffer, encoding) {
  if (encoding === 'cp437') return decCP437(buffer);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (encoding === 'utf8' || !utf8.includes('\uFFFD')) return utf8;
  const fixed = fixMojibake(utf8);
  return !fixed.includes('\uFFFD') || fixed !== utf8 ? fixed : decCP437(buffer);
}

function parseAnsi(text) {
  const grid = [];
  let row = 0, col = 0, maxColumns = 0;
  let foreground = { r: 187, g: 187, b: 187 }, background = { r: 0, g: 0, b: 0 };
  const foreground16 = { 30:{r:0,g:0,b:0},31:{r:187,g:0,b:0},32:{r:0,g:187,b:0},33:{r:187,g:187,b:0},34:{r:0,g:0,b:187},35:{r:187,g:0,b:187},36:{r:0,g:187,b:187},37:{r:187,g:187,b:187},90:{r:85,g:85,b:85},91:{r:255,g:85,b:85},92:{r:85,g:255,b:85},93:{r:255,g:255,b:85},94:{r:85,g:85,b:255},95:{r:255,g:85,b:255},96:{r:85,g:255,b:255},97:{r:255,g:255,b:255} };
  const background16 = { 40:{r:0,g:0,b:0},41:{r:187,g:0,b:0},42:{r:0,g:187,b:0},43:{r:187,g:187,b:0},44:{r:0,g:0,b:187},45:{r:187,g:0,b:187},46:{r:0,g:187,b:187},47:{r:187,g:187,b:187},100:{r:85,g:85,b:85},101:{r:255,g:85,b:85},102:{r:85,g:255,b:85},103:{r:255,g:255,b:85},104:{r:85,g:85,b:255},105:{r:255,g:85,b:255},106:{r:85,g:255,b:255},107:{r:255,g:255,b:255} };
  const applySGR = parameters => {
    for (let index = 0; index < parameters.length; index += 1) {
      const value = parameters[index];
      if (value === 0) { foreground = {r:187,g:187,b:187}; background = {r:0,g:0,b:0}; }
      else if (value === 39) foreground = {r:187,g:187,b:187};
      else if (value === 49) background = {r:0,g:0,b:0};
      else if (value === 38 && parameters[index + 1] === 2 && index + 4 < parameters.length) { foreground = {r:parameters[index + 2],g:parameters[index + 3],b:parameters[index + 4]}; index += 4; }
      else if (value === 48 && parameters[index + 1] === 2 && index + 4 < parameters.length) { background = {r:parameters[index + 2],g:parameters[index + 3],b:parameters[index + 4]}; index += 4; }
      else if ((value === 38 || value === 48) && parameters[index + 1] === 5 && index + 2 < parameters.length) index += 2;
      else if (foreground16[value]) foreground = { ...foreground16[value] };
      else if (background16[value]) background = { ...background16[value] };
    }
  };
  const parseCSI = start => {
    let index = start, parameters = [], current = '';
    while (index < text.length) {
      const character = text[index];
      if (/\d/.test(character)) current += character;
      else if (character === ';') { parameters.push(current === '' ? 0 : Number(current)); current = ''; }
      else if (character === 'm') { parameters.push(current === '' ? 0 : Number(current)); applySGR(parameters); return index + 1; }
      else if (character === 'H' || character === 'f') { parameters.push(current === '' ? 0 : Number(current)); row = Math.max(0, (parameters[0] || 1) - 1); col = Math.max(0, (parameters[1] || 1) - 1); return index + 1; }
      else if (character === 'A') { row = Math.max(0, row - (Number(current) || 1)); return index + 1; }
      else if (character === 'B') { row += Number(current) || 1; return index + 1; }
      else if (character === 'C') { col += Number(current) || 1; return index + 1; }
      else if (character === 'D') { col = Math.max(0, col - (Number(current) || 1)); return index + 1; }
      else { while (index < text.length && !/[a-zA-Z]/.test(text[index])) index += 1; return index + 1; }
      index += 1;
    }
    return index;
  };
  const looksLikeCSI = index => {
    if (text[index] !== '[' || !/[\d;]/.test(text[index + 1] || '')) return false;
    for (let cursor = index + 1; cursor < text.length && cursor - index < 50; cursor += 1) {
      if (/[a-zA-Z]/.test(text[cursor])) return true;
      if (!/[\d;]/.test(text[cursor])) return false;
    }
    return false;
  };
  for (let index = 0; index < text.length;) {
    const character = String.fromCodePoint(text.codePointAt(index));
    if (character === '\x1b' && text[index + 1] === '[') { index = parseCSI(index + 2); continue; }
    if (character === '[' && looksLikeCSI(index)) { index = parseCSI(index + 1); continue; }
    if (character === '\n') { row += 1; col = 0; index += 1; continue; }
    if (character === '\r') { col = 0; index += 1; continue; }
    if (character === '\t') { col = Math.ceil((col + 1) / 8) * 8; index += 1; continue; }
    if (character === '\x08') { col = Math.max(0, col - 1); index += 1; continue; }
    if (!grid[row]) grid[row] = [];
    grid[row][col] = { ch: character, fg: { ...foreground }, bg: { ...background } };
    col += 1; maxColumns = Math.max(maxColumns, col); index += character.length;
  }
  while (grid.length && (!grid.at(-1) || grid.at(-1).length === 0)) grid.pop();
  return { grid, rows: grid.length, cols: maxColumns };
}

function drawBlock(context, x, y, type, foreground, cellWidth, cellHeight) {
  context.fillStyle = `rgb(${foreground.r},${foreground.g},${foreground.b})`;
  const fraction = /^(upper|lower)([1-7])$/.exec(type);
  if (fraction) { const height = Math.round(cellHeight * Number(fraction[2]) / 8); context.fillRect(x, fraction[1] === 'upper' ? y : y + cellHeight - height, cellWidth, height); return; }
  const halfWidth = cellWidth >> 1, halfHeight = cellHeight >> 1;
  if (type === 'full') context.fillRect(x, y, cellWidth, cellHeight);
  else if (type === 'upper') context.fillRect(x, y, cellWidth, halfHeight);
  else if (type === 'lower') context.fillRect(x, y + halfHeight, cellWidth, halfHeight);
  else if (type === 'left') context.fillRect(x, y, halfWidth, cellHeight);
  else if (type === 'right') context.fillRect(x + halfWidth, y, halfWidth, cellHeight);
  else if (type === 'shade1' || type === 'shade2' || type === 'shade3') {
    if (type === 'shade3') { context.fillRect(x, y, cellWidth, cellHeight); context.fillStyle = 'rgba(0,0,0,0.75)'; }
    const step = type === 'shade2' ? 1 : 2;
    for (let pixelY = 0; pixelY < cellHeight; pixelY += step) for (let pixelX = (pixelY / step) % 2; pixelX < cellWidth; pixelX += 2) context.fillRect(x + pixelX, y + pixelY, 1, 1);
  }
}

function render(canvas, context, grid, rows, cols, cellWidth, cellHeight) {
  canvas.width = cols * cellWidth; canvas.height = rows * cellHeight;
  context.imageSmoothingEnabled = false; context.fillStyle = 'transparent'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = `${cellHeight}px "Adwaita","Fira Code","Courier New",monospace`; context.textBaseline = 'top'; context.textAlign = 'center';
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) for (let column = 0; column < (grid[rowIndex] || []).length; column += 1) {
    const cell = grid[rowIndex][column]; if (!cell) continue;
    const x = column * cellWidth, y = rowIndex * cellHeight;
    context.fillStyle = `rgb(${cell.bg.r},${cell.bg.g},${cell.bg.b})`;
    if (cell.bg.r == 0 && cell.bg.g == 0 && cell.bg.b == 0) {} else {
      context.fillRect(x, y, cellWidth, cellHeight);
    }
    const block = ANSI_BLOCKS[cell.ch];
    if (block) drawBlock(context, x, y, block, cell.fg, cellWidth, cellHeight);
    else if (cell.ch !== ' ') { context.fillStyle = `rgb(${cell.fg.r},${cell.fg.g},${cell.fg.b})`; context.fillText(cell.ch, x + cellWidth / 2, y); }
  }
}

/** Render ANSI text or bytes into a canvas, returning its rendered dimensions. */
function renderAnsi(canvas, ansi, { encoding = 'auto', cellWidth = 8, cellHeight = 16 } = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('canvas must be an HTMLCanvasElement.');
  if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) throw new TypeError('Cell dimensions must be positive numbers.');
  const text = typeof ansi === 'string' ? ansi : decodeBuf(ansi, encoding);
  const context = canvas.getContext('2d', { willReadFrequently: false });
  const { grid, rows, cols } = parseAnsi(text);
  render(canvas, context, grid, rows, cols, cellWidth, cellHeight);
  return { rows, cols, width: canvas.width, height: canvas.height };
}

window.renderAnsi = renderAnsi;


function renderAnsiHtml(ansiString) { // old
    // Performance optimization: Build HTML in an array rather than string concatenation
    const htmlParts = [];
    let currentFg = '';
    let currentBg = '';
    let buffer = '';
            
    // Helper to escape HTML entities to prevent XSS/breaking layout
    const escapeHtml = (text) => {
        return text.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;');
    };

    // Helper to convert 256-color ANSI codes to RGB strings
    const get256Color = (n) => {
        if (n < 16) {
            // Standard colors
            const colors = [
                '#000000','#aa0000','#00aa00','#aa5500','#0000aa','#aa00aa','#00aaaa','#aaaaaa',
                '#555555','#ff5555','#55ff55','#ffff55','#5555ff','#ff55ff','#55ffff','#ffffff'
            ];
            return colors[n];
        } else if (n < 232) {
            // 6x6x6 Color Cube
            n -= 16;
            const r = Math.floor(n / 36) * 51;
            const g = Math.floor((n % 36) / 6) * 51;
            const b = (n % 6) * 51;
            return `rgb(${r},${g},${b})`;
        } else {
            // Grayscale ramp
            const gray = (n - 232) * 10 + 8;
            return `rgb(${gray},${gray},${gray})`;
        }
    };

    // Regex to match ANSI escape sequences. 
    // Note: We use (?:\x1b\[|\[) because the user's example is missing the actual 
    // ESC (\x1b) character, which is common when copy-pasting from terminals.
    const regex = /(?:\x1b\[|\[)([0-9;]*)m/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(ansiString)) !== null) {
        // Get the plain text before this escape sequence
        buffer += ansiString.substring(lastIndex, match.index);
        lastIndex = regex.lastIndex;

        // Parse the numbers inside the escape sequence (e.g., "38;2;255;0;0")
        const params = match[1].split(';').map(Number);
        let newFg = currentFg;
        let newBg = currentBg;

        for (let i = 0; i < params.length; i++) {
            const p = params[i];
            if (p === 0) {
                // Reset
                newFg = '';
                newBg = '';
            } else if (p === 38) {
                // Foreground
                if (params[i+1] === 2) {
                    newFg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`;
                    i += 4; // Skip the next 4 numbers
                } else if (params[i+1] === 5) {
                    newFg = get256Color(params[i+2]);
                    i += 2;
                }
            } else if (p === 48) {
                // Background
                if (params[i+1] === 2) {
                    newBg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`;
                    i += 4; // Skip the next 4 numbers
                } else if (params[i+1] === 5) {
                    newBg = get256Color(params[i+2]);
                    i += 2;
                }
            }
            // Can be expanded to handle bold (1), italic (3), etc.
        }

        // If the colors changed, flush the buffer into a styled span
        if (newFg !== currentFg || newBg !== currentBg) {
            if (buffer.length > 0) {
                const style = `color:${currentFg || 'inherit'};background-color:${currentBg || 'transparent'};`;
                htmlParts.push(`<span style="${style}">${escapeHtml(buffer)}</span>`);
                buffer = '';
            }
            currentFg = newFg;
            currentBg = newBg;
        }
    }

    // Flush any remaining text after the last escape sequence
    buffer += ansiString.substring(lastIndex);
    if (buffer.length > 0) {
        const style = `color:${currentFg || 'inherit'};background-color:${currentBg || 'transparent'};`;
        htmlParts.push(`<span style="${style}">${escapeHtml(buffer)}</span>`);
    }

    return htmlParts.join('');
}
