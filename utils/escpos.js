export function textToEscPos(text, opts) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const bytes = [];

  bytes.push(ESC, 0x40); // reset

  const cp = (opts?.codepage ?? 0) & 0xff;
  bytes.push(ESC, 0x74, cp);

  const sizeByte = opts?.scale === 'large' ? 0x01 : 0x00;
  bytes.push(GS, 0x21, sizeByte);

  // Replace Rupee symbol ₹ and Unicode characters with safe ASCII equivalents
  const safeText = String(text || '')
    .replace(/₹/g, 'Rs.')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ');

  const rasterSig = String.fromCharCode(0x1d, 0x76, 0x30); // GS v 0
  const hasRaster = safeText.indexOf(rasterSig) !== -1;
  const normalized = hasRaster ? safeText : safeText.replace(/\r?\n/g, "\r\n");

  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (!hasRaster && code > 127) {
      bytes.push(0x20); // space fallback for unmapped non-ASCII char to prevent 0x18 CAN buffer cancellation
    } else {
      bytes.push(code & 0xff);
    }
  }

  const feed = Math.max(0, Math.min(20, opts?.feed ?? 4));
  for (let i = 0; i < feed; i++) bytes.push(0x0a);

  if (opts?.cut !== 'none') {
    bytes.push(GS, 0x56, opts?.cut === 'partial' ? 0x01 : 0x00);
  }
  return new Uint8Array(bytes);
}
