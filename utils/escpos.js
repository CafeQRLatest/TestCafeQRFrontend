export function textToEscPos(text, opts) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const bytes = [];

  bytes.push(ESC, 0x40); // reset

  const cp = (opts?.codepage ?? 0) & 0xff;
  bytes.push(ESC, 0x74, cp);

  const sizeByte = opts?.scale === 'large' ? 0x01 : 0x00;
  bytes.push(GS, 0x21, sizeByte);

  const raw = String(text || '');
  const rasterSig = String.fromCharCode(0x1d, 0x76, 0x30); // GS v 0

  let i = 0;
  while (i < raw.length) {
    if (raw.substr(i, 3) === rasterSig) {
      const headerLen = 8;
      if (i + headerLen <= raw.length) {
        const xL = raw.charCodeAt(i + 4);
        const xH = raw.charCodeAt(i + 5);
        const yL = raw.charCodeAt(i + 6);
        const yH = raw.charCodeAt(i + 7);
        const bytesPerRow = xL + (xH << 8);
        const rows = yL + (yH << 8);
        const dataLen = bytesPerRow * rows;
        const totalRasterLen = headerLen + dataLen;

        if (totalRasterLen > headerLen && i + totalRasterLen <= raw.length) {
          for (let j = 0; j < totalRasterLen; j++) {
            bytes.push(raw.charCodeAt(i + j) & 0xff);
          }
          i += totalRasterLen;
          continue;
        }
      }
    }

    const ch = raw[i];
    const code = raw.charCodeAt(i);

    if (ch === '₹') {
      bytes.push(0x52, 0x73, 0x2e); // 'Rs.'
    } else if (/[\u2018\u2019\u201A\u201B]/.test(ch)) {
      bytes.push(0x27); // '
    } else if (/[\u201C\u201D\u201E\u201F]/.test(ch)) {
      bytes.push(0x22); // "
    } else if (/[\u2013\u2014\u2212]/.test(ch)) {
      bytes.push(0x2d); // -
    } else if (ch === '\u2022') {
      bytes.push(0x2a); // *
    } else if (ch === '\u00A0') {
      bytes.push(0x20); // space
    } else if (ch === '\n') {
      if (i === 0 || raw[i - 1] !== '\r') {
        bytes.push(0x0d, 0x0a); // \r\n
      } else {
        bytes.push(0x0a); // \n
      }
    } else if (code > 127) {
      bytes.push(0x20); // space fallback for unmapped non-ASCII char
    } else {
      bytes.push(code & 0xff);
    }
    i++;
  }

  const feed = Math.max(0, Math.min(20, opts?.feed ?? 4));
  for (let f = 0; f < feed; f++) bytes.push(0x0a);

  if (opts?.cut !== 'none') {
    bytes.push(GS, 0x56, opts?.cut === 'partial' ? 0x01 : 0x00);
  }
  return new Uint8Array(bytes);
}

