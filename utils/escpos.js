export function textToEscPos(text, opts) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const bytes = [];

  bytes.push(ESC, 0x40); // reset

  const cp = (opts?.codepage ?? 0) & 0xff;
  bytes.push(ESC, 0x74, cp);

  const sizeByte = opts?.scale === 'large' ? 0x01 : 0x00;
  bytes.push(GS, 0x21, sizeByte);

  const rasterSig = String.fromCharCode(0x1d, 0x76, 0x30); // GS v 0
  const hasRaster = text.indexOf(rasterSig) !== -1;
  const normalized = hasRaster ? text : text.replace(/\r?\n/g, "\r\n");

  for (let i = 0; i < normalized.length; i++) {
    bytes.push(normalized.charCodeAt(i) & 0xff);
  }

  const feed = Math.max(0, Math.min(20, opts?.feed ?? 4));
  for (let i = 0; i < feed; i++) bytes.push(0x0a);

  bytes.push(GS, 0x56, opts?.cut === 'partial' ? 0x01 : 0x00);
  return new Uint8Array(bytes);
}
