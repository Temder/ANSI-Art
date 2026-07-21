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
  const vertical = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
  const quadrants = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
  const escape = '\\x1b[';

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
  const color = value => [Math.round(value.r / value.count), Math.round(value.g / value.count), Math.round(value.b / value.count)];
  const error = value => value.rr - value.r * value.r / value.count + value.gg - value.g * value.g / value.count + value.bb - value.b * value.b / value.count;
  const join = (a, b) => ({
    count: a.count + b.count, r: a.r + b.r, g: a.g + b.g, b: a.b + b.b,
    rr: a.rr + b.rr, gg: a.gg + b.gg, bb: a.bb + b.bb,
  });

  const bestCell = (column, row) => {
    const x = column * cellSize, y = row * cellSize;
    let fullyTransparent = true;
    for (let pixelY = y; pixelY < y + cellSize && fullyTransparent; pixelY += 1) {
      for (let pixelX = x; pixelX < x + cellSize; pixelX += 1) {
        if (pixels[(pixelY * pixelWidth + pixelX) * 4 + 3] !== 0) {
          fullyTransparent = false;
          break;
        }
      }
    }
    // ANSI has no alpha. A reset space leaves the terminal's existing
    // background visible, which preserves completely transparent areas.
    if (fullyTransparent) return { transparent: true };

    const full = stats(x, y, x + 8, y + 8);
    const candidates = [{ char: '█', fg: color(full), bg: color(full), error: error(full) }];

    for (let fill = 0; fill <= 8; fill += 1) {
      const top = fill < 8 ? stats(x, y, x + 8, y + 8 - fill) : null;
      const bottom = fill > 0 ? stats(x, y + 8 - fill, x + 8, y + 8) : null;
      const fg = bottom || top;
      const bg = top || bottom;
      candidates.push({ char: horizontal[fill], fg: color(fg), bg: color(bg), error: (top ? error(top) : 0) + (bottom ? error(bottom) : 0) });

      const left = fill > 0 ? stats(x, y, x + fill, y + 8) : null;
      const right = fill < 8 ? stats(x + fill, y, x + 8, y + 8) : null;
      const leftFg = left || right;
      const rightBg = right || left;
      candidates.push({ char: vertical[fill], fg: color(leftFg), bg: color(rightBg), error: (left ? error(left) : 0) + (right ? error(right) : 0) });
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
      candidates.push({ char: quadrants[mask], fg: color(fg), bg: color(bg), error: (foreground ? error(foreground) : 0) + (background ? error(background) : 0) });
    }

    return candidates.reduce((best, candidate) => candidate.error < best.error ? candidate : best);
  };

  let ansi = '';
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const cell = bestCell(column, row);
      if (cell.transparent) {
        ansi += `${escape}0m `;
        continue;
      }
      ansi += `${escape}38;2;${cell.fg[0]};${cell.fg[1]};${cell.fg[2]}m`;
      ansi += `${escape}48;2;${cell.bg[0]};${cell.bg[1]};${cell.bg[2]}m${cell.char}`;
    }
    ansi += `${escape}0m\n`;
  }
  return ansi;
}

window.imageToAnsi = imageToAnsi;
