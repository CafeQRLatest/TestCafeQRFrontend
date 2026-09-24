// utils/upiQrGenerator.js
// Enterprise UPI Payment URI & QR Code Generation Engine
// Compliant with NPCI UPI Deep-linking Specification
// Supports ESC/POS Native Thermal Commands, Canvas Rendering & Inline Vector SVG

const QRMode = { BYTE: 4 };

// GF(256) Math tables for Reed-Solomon Error Correction
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(function initGfTables() {
  for (let i = 0, x = 1; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gmult(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsGenPoly(numEc) {
  let g = [1];
  for (let i = 0; i < numEc; i++) {
    const root = EXP_TABLE[i];
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= gmult(g[j], root);
      next[j + 1] ^= g[j];
    }
    g = next;
  }
  return g;
}

function rsEncode(data, numEc) {
  const gen = rsGenPoly(numEc);
  const remainder = new Array(numEc).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < numEc - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gmult(gen[numEc - j], factor);
    }
    remainder[numEc - 1] = gmult(gen[0], factor);
  }
  return remainder;
}

// Version table for Error Correction Level M (15% error recovery)
// [version, totalBytes, ecBytesPerBlock, numBlocksG1, dataBytesG1, numBlocksG2, dataBytesG2]
const QR_TABLE_M = [
  null,
  [1, 26, 10, 1, 16, 0, 0],
  [2, 44, 16, 1, 28, 0, 0],
  [3, 70, 26, 1, 44, 0, 0],
  [4, 100, 18, 2, 32, 0, 0],
  [5, 134, 24, 2, 43, 0, 0],
  [6, 172, 16, 4, 27, 0, 0],
  [7, 196, 18, 4, 31, 0, 0],
  [8, 242, 22, 2, 38, 2, 39],
  [9, 292, 22, 3, 36, 2, 37],
  [10, 346, 26, 4, 43, 1, 44],
];

const ALIGNMENT_PATTERN_POS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function selectVersion(dataLen) {
  for (let v = 1; v <= 10; v++) {
    const info = QR_TABLE_M[v];
    const totalDataCapacity = info[3] * info[4] + info[5] * info[6];
    const headerBits = 4 + (v < 10 ? 8 : 16);
    const maxDataBytes = Math.floor((totalDataCapacity * 8 - headerBits) / 8);
    if (dataLen <= maxDataBytes) {
      return v;
    }
  }
  return 10;
}

function createBitBuffer() {
  const buffer = [];
  let length = 0;
  return {
    put(num, count) {
      for (let i = 0; i < count; i++) {
        buffer.push(((num >>> (count - i - 1)) & 1) === 1);
        length++;
      }
    },
    getBits() { return buffer; },
    getLength() { return length; }
  };
}

function encodeData(dataStr, version) {
  const bytes = new TextEncoder().encode(dataStr);
  const bb = createBitBuffer();
  bb.put(QRMode.BYTE, 4);
  bb.put(bytes.length, version < 10 ? 8 : 16);
  for (let i = 0; i < bytes.length; i++) {
    bb.put(bytes[i], 8);
  }

  const info = QR_TABLE_M[version];
  const totalDataBytes = info[3] * info[4] + info[5] * info[6];
  const totalDataBits = totalDataBytes * 8;

  const padZeros = Math.min(4, totalDataBits - bb.getLength());
  if (padZeros > 0) bb.put(0, padZeros);

  while (bb.getLength() % 8 !== 0) {
    bb.put(0, 1);
  }

  const bits = bb.getBits();
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      if (bits[i + j]) byte |= (1 << (7 - j));
    }
    dataBytes.push(byte);
  }

  let pad = 0xec;
  while (dataBytes.length < totalDataBytes) {
    dataBytes.push(pad);
    pad = (pad === 0xec) ? 0x11 : 0xec;
  }

  const blocks = [];
  let offset = 0;
  const numBlocksG1 = info[3];
  const bytesG1 = info[4];
  const numBlocksG2 = info[5];
  const bytesG2 = info[6];
  const ecCount = info[2];

  for (let i = 0; i < numBlocksG1; i++) {
    const raw = dataBytes.slice(offset, offset + bytesG1);
    offset += bytesG1;
    blocks.push({ data: raw, ec: rsEncode(raw, ecCount) });
  }
  for (let i = 0; i < numBlocksG2; i++) {
    const raw = dataBytes.slice(offset, offset + bytesG2);
    offset += bytesG2;
    blocks.push({ data: raw, ec: rsEncode(raw, ecCount) });
  }

  const finalSequence = [];
  const maxDataLen = Math.max(bytesG1, bytesG2 || 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blocks[b].data.length) finalSequence.push(blocks[b].data[i]);
    }
  }
  for (let i = 0; i < ecCount; i++) {
    for (let b = 0; b < blocks.length; b++) {
      finalSequence.push(blocks[b].ec[i]);
    }
  }

  return finalSequence;
}

/**
 * Generates a 2D boolean array representing the QR code matrix.
 * True = dark module, False = light module.
 */
export function generateQrMatrix(text) {
  if (!text) return [];
  const version = selectVersion(text.length);
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(null));

  function drawFinder(r, c) {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const row = r + y;
        const col = c + x;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if ((x >= 0 && x <= 6 && (y === 0 || y === 6)) ||
            (y >= 0 && y <= 6 && (x === 0 || x === 6)) ||
            (x >= 2 && x <= 4 && y >= 2 && y <= 4)) {
          matrix[row][col] = true;
        } else {
          matrix[row][col] = false;
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = bit;
    if (matrix[i][6] === null) matrix[i][6] = bit;
  }

  // Alignment patterns
  const alignPos = ALIGNMENT_PATTERN_POS[version] || [];
  for (let i = 0; i < alignPos.length; i++) {
    for (let j = 0; j < alignPos.length; j++) {
      const r = alignPos[i];
      const c = alignPos[j];
      if (matrix[r][c] !== null) continue;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          if (Math.abs(y) === 2 || Math.abs(x) === 2 || (y === 0 && x === 0)) {
            matrix[r + y][c + x] = true;
          } else {
            matrix[r + y][c + x] = false;
          }
        }
      }
    }
  }

  // Dark module
  matrix[4 * version + 9][8] = true;

  // Format info area reservation
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }

  // Interleaved data bits
  const rawData = encodeData(text, version);
  const dataBits = [];
  for (const byte of rawData) {
    for (let b = 7; b >= 0; b--) {
      dataBits.push(((byte >> b) & 1) === 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const colList = [right, right - 1];
    const rowList = upwards 
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rowList) {
      for (const col of colList) {
        if (matrix[row][col] === null) {
          const bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : false;
          const mask = (row + col) % 2 === 0;
          matrix[row][col] = mask ? !bit : bit;
        }
      }
    }
    upwards = !upwards;
  }

  // Format bits for ECC M + Mask 0
  const FORMAT_BITS = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Copy 1: around top-left finder pattern
  for (let i = 0; i < 6; i++) matrix[8][i] = FORMAT_BITS[i] === 1;
  matrix[8][7] = FORMAT_BITS[6] === 1;
  matrix[8][8] = FORMAT_BITS[7] === 1;
  matrix[7][8] = FORMAT_BITS[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = FORMAT_BITS[i] === 1;
  // Copy 2: Bottom-left (bits 0 to 6, column 8)
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = FORMAT_BITS[i] === 1;
  // Copy 2: Top-right (bits 7 to 14, row 8)
  for (let i = 0; i < 8; i++) matrix[8][size - 8 + i] = FORMAT_BITS[7 + i] === 1;

  return matrix;
}

/**
 * Builds standard NPCI UPI URI
 * e.g. upi://pay?pa=merchant@upi&pn=Cafe+Delight&am=728.00&cu=INR&tn=Bill+1042
 */
export function buildUpiUri({ upiId, payeeName, amount, billRef, note }) {
  if (!upiId || typeof upiId !== 'string' || !upiId.includes('@')) {
    return '';
  }
  const pa = upiId.trim();
  const pn = (payeeName || '').trim();
  const tn = (note || billRef || 'Bill Payment').trim();
  
  let uri = `upi://pay?pa=${encodeURIComponent(pa)}`;
  if (pn) uri += `&pn=${encodeURIComponent(pn)}`;
  if (amount !== undefined && amount !== null && !isNaN(Number(amount)) && Number(amount) > 0) {
    uri += `&am=${Number(amount).toFixed(2)}`;
  }
  uri += `&cu=INR`;
  if (tn) uri += `&tn=${encodeURIComponent(tn)}`;
  return uri;
}

/**
 * Builds ESC/POS thermal printer Model 2 QR commands.
 * Compatible with Epson, Xprinter, Rongta, Everycom, TVS, HOIN, Sunmi, etc.
 */
export function buildEscposQrCommands(data, options = {}) {
  if (!data) return '';
  const is80 = options.is80 || false;
  // Module size: 5 for 58mm paper (~160px width), 6 for 80mm paper (~220px width)
  const moduleSize = options.moduleSize || (is80 ? 6 : 5);
  const ecLevel = 49; // 49 = Level M (15%)
  const len = data.length + 3;
  const pL = len % 256;
  const pH = Math.floor(len / 256);

  const GS = '\x1d';
  return (
    GS + '(k\x04\x001A2\x00' + // Function 165: Model 2
    GS + `(k\x03\x001C${String.fromCharCode(moduleSize)}` + // Function 167: Module size
    GS + `(k\x03\x001E${String.fromCharCode(ecLevel)}` + // Function 169: Error correction level
    GS + `(k${String.fromCharCode(pL)}${String.fromCharCode(pH)}1P0` + data + // Function 180: Store symbol data
    GS + '(k\x03\x001Q0' // Function 181: Print symbol
  );
}

/**
 * Renders the Cafe QR coffee-cup silhouette into a 1-bit monochrome bitmap buffer.
 */
function renderCoffeeCupSilhouette(setPixel, badgePixelX, badgePixelY, badgeSizeDots) {
  for (let py = 0; py < badgeSizeDots; py++) {
    const v = py / badgeSizeDots; // 0.0 (top) to 1.0 (bottom)
    for (let px = 0; px < badgeSizeDots; px++) {
      const u = px / badgeSizeDots; // 0.0 (left) to 1.0 (right)
      let isBlack = false;

      // 1. Steam plume rising from cup (v: 0.10 to 0.35)
      if (v >= 0.10 && v <= 0.35) {
        const steamCenter = 0.44 + 0.04 * Math.sin((v - 0.10) * 16);
        if (Math.abs(u - steamCenter) <= 0.04) {
          isBlack = true;
        }
      }

      // 2. Coffee cup rim (v: 0.39 to 0.43, u: 0.20 to 0.68)
      if (v >= 0.39 && v <= 0.43 && u >= 0.20 && u <= 0.68) {
        isBlack = true;
      }

      // 3. Coffee cup bowl (v: 0.43 to 0.73)
      if (v > 0.43 && v <= 0.73) {
        const prog = (v - 0.43) / 0.30;
        const halfW = 0.24 * (1 - 0.35 * Math.pow(prog, 1.7));
        if (Math.abs(u - 0.44) <= halfW) {
          isBlack = true;
        }
      }

      // 4. Handle on right (v: 0.45 to 0.68, u: 0.62 to 0.81)
      if (v >= 0.45 && v <= 0.68 && u >= 0.62 && u <= 0.81) {
        const isHole = (v >= 0.51 && v <= 0.62 && u >= 0.66 && u <= 0.76);
        if (!isHole) {
          isBlack = true;
        }
      }

      // 5. Saucer base line (v: 0.78 to 0.85, u: 0.15 to 0.73)
      if (v >= 0.78 && v <= 0.85 && u >= 0.15 && u <= 0.73) {
        isBlack = true;
      }

      if (isBlack) {
        setPixel(badgePixelX + px, badgePixelY + py);
      }
    }
  }
}

/**
 * Builds high-contrast ESC/POS monochrome raster bitmap (GS v 0) with
 * the Cafe QR coffee-cup silhouette cleanly embedded in the center.
 * Perfectly centered on thermal paper (58mm = 384 dots, 80mm = 576 dots).
 */
export function buildEscposBrandedQrRaster(data, options = {}) {
  if (!data) return '';
  const matrix = generateQrMatrix(data);
  if (!matrix || !matrix.length) return '';

  const is80 = options.is80 || false;
  const moduleDots = options.moduleDots || (is80 ? 6 : 5);
  const totalPaperDots = is80 ? 576 : 384;

  const matrixSize = matrix.length;
  const quietModules = 3;
  const qrTotalModules = matrixSize + quietModules * 2;
  const qrTotalDots = qrTotalModules * moduleDots;

  // Exact horizontal centering within paper width
  const totalWidthDots = totalPaperDots;
  const widthBytes = Math.ceil(totalWidthDots / 8);
  const startX = Math.max(0, Math.floor((totalWidthDots - qrTotalDots) / 2));
  const heightDots = qrTotalDots;

  const bitmap = new Uint8Array(widthBytes * heightDots);

  function setPixel(x, y) {
    if (x < 0 || x >= totalWidthDots || y < 0 || y >= heightDots) return;
    const byteIdx = y * widthBytes + (x >> 3);
    bitmap[byteIdx] |= (0x80 >> (x & 7));
  }

  function clearPixel(x, y) {
    if (x < 0 || x >= totalWidthDots || y < 0 || y >= heightDots) return;
    const byteIdx = y * widthBytes + (x >> 3);
    bitmap[byteIdx] &= ~(0x80 >> (x & 7));
  }

  // 1. Draw all QR modules
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        const baseX = startX + (c + quietModules) * moduleDots;
        const baseY = (r + quietModules) * moduleDots;
        for (let dy = 0; dy < moduleDots; dy++) {
          for (let dx = 0; dx < moduleDots; dx++) {
            setPixel(baseX + dx, baseY + dy);
          }
        }
      }
    }
  }

  // 2. Center badge area (~20% of QR code width, well within Level M recovery limits)
  const badgeModules = Math.min(9, Math.max(7, (Math.floor(matrixSize * 0.22) | 1)));
  const halfBadge = Math.floor(badgeModules / 2);
  const centerMod = Math.floor(matrixSize / 2);
  const badgeStartModX = centerMod - halfBadge;
  const badgeStartModY = centerMod - halfBadge;
  const badgePixelX = startX + (badgeStartModX + quietModules) * moduleDots;
  const badgePixelY = (badgeStartModY + quietModules) * moduleDots;
  const badgeSizeDots = badgeModules * moduleDots;

  // 3. Clear center badge to pure white (quiet zone around silhouette)
  for (let y = badgePixelY; y < badgePixelY + badgeSizeDots; y++) {
    for (let x = badgePixelX; x < badgePixelX + badgeSizeDots; x++) {
      clearPixel(x, y);
    }
  }

  // 4. Render coffee-cup silhouette in the center badge
  renderCoffeeCupSilhouette(setPixel, badgePixelX, badgePixelY, badgeSizeDots);

  // 5. Build ESC/POS GS v 0 raster command
  const GS = '\x1d';
  const xL = String.fromCharCode(widthBytes % 256);
  const xH = String.fromCharCode(Math.floor(widthBytes / 256));
  const yL = String.fromCharCode(heightDots % 256);
  const yH = String.fromCharCode(Math.floor(heightDots / 256));

  let escpos = GS + 'v0\x00' + xL + xH + yL + yH;
  for (let i = 0; i < bitmap.length; i++) {
    escpos += String.fromCharCode(bitmap[i]);
  }
  return escpos;
}

/**
 * Primary ESC/POS QR builder: Uses the thermal printer's native hardware QR engine
 * (ESC/POS GS ( k) to guarantee 100% scan reliability on Google Pay, PhonePe, and Paytm.
 */
export function buildEscposBrandedQr(data, options = {}) {
  return buildEscposQrCommands(data, options);
}

/**
 * Builds an SVG path string from a QR matrix.
 */
export function generateQrSvgPath(matrix) {
  if (!matrix || !matrix.length) return '';
  const size = matrix.length;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        path += `M${c},${r}h1v1h-1z `;
      }
    }
  }
  return path;
}

/**
 * React Component for rendering standalone QR code as high-performance SVG
 * with the Cafe QR coffee-cup silhouette cleanly embedded in the center.
 */
export function UpiQrCodeSvg({ value, size = 160, margin = 2, className = '', style = {}, showLogo = true }) {
  if (!value) return null;
  const matrix = generateQrMatrix(value);
  if (!matrix.length) return null;
  const matrixSize = matrix.length;
  const viewBoxSize = matrixSize + margin * 2;
  const path = generateQrSvgPath(matrix);

  const badgeModules = Math.min(9, Math.max(7, (Math.floor(matrixSize * 0.22) | 1)));
  const center = viewBoxSize / 2;
  const badgeX = center - badgeModules / 2;
  const badgeY = center - badgeModules / 2;
  const scale = badgeModules / 40;

  return (
    <svg
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', shapeRendering: 'crispEdges', ...style }}
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <g transform={`translate(${margin}, ${margin})`}>
        <path d={path} fill="#000000" />
      </g>
      {showLogo && (
        <g transform={`translate(${badgeX}, ${badgeY})`}>
          <rect x="0" y="0" width={badgeModules} height={badgeModules} rx="0.5" fill="#ffffff" />
          <g transform={`scale(${scale})`}>
            {/* Steam plume */}
            <path d="M18 5 C16 9 20 11 17.5 14 C16.5 11 19.5 9 18.5 5 Z" fill="#000000" />
            {/* Coffee cup rim & body */}
            <path d="M8 17 H27 C27 24 23 29 17.5 29 C12 29 8 24 8 17 Z" fill="#000000" />
            {/* Cup handle */}
            <path d="M26 19 C31 19 33 21 33 24 C33 27 30 28 26 28" fill="none" stroke="#000000" strokeWidth="2.4" strokeLinecap="round" />
            {/* Saucer */}
            <rect x="6.5" y="31" width="22" height="2.5" rx="1.2" fill="#000000" />
          </g>
        </g>
      )}
    </svg>
  );
}
