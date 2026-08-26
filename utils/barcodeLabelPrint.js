/**
 * Utility for generating and printing thermal barcode sticker labels.
 * Uses JsBarcode (loaded via CDN dynamically if missing) and offscreen canvas
 * to render crisp 203 DPI thermal label images and trigger print via ESC/POS raw spooler or iframe fallback.
 */

function loadJsBarcode() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Browser environment required'));
    }
    if (window.JsBarcode) {
      return resolve(window.JsBarcode);
    }
    if (document.getElementById('jsbarcode-cdn')) {
      const existing = document.getElementById('jsbarcode-cdn');
      existing.addEventListener('load', () => resolve(window.JsBarcode));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'jsbarcode-cdn';
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    script.onload = () => resolve(window.JsBarcode);
    script.onerror = () => reject(new Error('Failed to load JsBarcode library'));
    document.head.appendChild(script);
  });
}

function getStoredLabelConfig() {
  if (typeof window === 'undefined') {
    return { widthMm: 50, heightMm: 25, showName: true, showPrice: true, showMrp: true, barcodeFormat: 'AUTO' };
  }
  try {
    return {
      widthMm: Number(localStorage.getItem('PRINT_LABEL_WIDTH_MM')) || 50,
      heightMm: Number(localStorage.getItem('PRINT_LABEL_HEIGHT_MM')) || 25,
      showName: localStorage.getItem('PRINT_LABEL_SHOW_NAME') !== '0',
      showPrice: localStorage.getItem('PRINT_LABEL_SHOW_PRICE') !== '0',
      showMrp: localStorage.getItem('PRINT_LABEL_SHOW_MRP') !== '0',
      barcodeFormat: localStorage.getItem('PRINT_LABEL_FORMAT') || 'AUTO'
    };
  } catch (e) {
    return { widthMm: 50, heightMm: 25, showName: true, showPrice: true, showMrp: true, barcodeFormat: 'AUTO' };
  }
}

/**
 * Converts a label canvas element into ESC/POS GS v 0 raster bit image Base64.
 */
function canvasToEscPosBase64(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const bytesPerRow = Math.ceil(w / 8);
  const bytes = [];

  // ESC @ (Initialize printer)
  bytes.push(0x1b, 0x40);
  // ESC a 1 (Center alignment)
  bytes.push(0x1b, 0x61, 0x01);

  // GS v 0 0 xL xH yL yH (Raster Bit Image)
  bytes.push(0x1d, 0x76, 0x30, 0x00);
  bytes.push(bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff);
  bytes.push(h & 0xff, (h >> 8) & 0xff);

  for (let y = 0; y < h; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < w) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < 180) { // Black pixel
            byte |= (0x80 >> bit);
          }
        }
      }
      bytes.push(byte);
    }
  }

  // ESC d 3 (Feed 3 lines)
  bytes.push(0x1b, 0x64, 0x03);

  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Renders a barcode sticker onto a canvas element.
 */
export async function generateLabelCanvas({
  name = '',
  barcode = '',
  price = null,
  mrp = null,
  sym = '₹',
  config = null
}) {
  await loadJsBarcode();

  const cfg = { ...getStoredLabelConfig(), ...(config || {}) };
  const widthMm = cfg.widthMm || 50;
  const heightMm = cfg.heightMm || 25;

  // 203 DPI conversion: 1mm ≈ 8 pixels (203 / 25.4)
  const pxPerMm = 8;
  const canvasWidth = Math.round(widthMm * pxPerMm);
  const canvasHeight = Math.round(heightMm * pxPerMm);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  // Fill crisp white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = '#000000';

  let currentY = 8;

  // 1. Draw Product Name at top
  if (cfg.showName && name) {
    const fontSize = Math.max(12, Math.round(canvasHeight * 0.13));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    
    // Wrap name if longer than label width
    const maxWidth = canvasWidth - 16;
    const words = name.split(' ');
    let line = '';
    let lines = [];
    
    for (let w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);

    // Limit to max 2 lines
    lines = lines.slice(0, 2);
    for (let l of lines) {
      ctx.fillText(l, canvasWidth / 2, currentY + fontSize);
      currentY += fontSize + 2;
    }
    currentY += 4;
  }

  // 2. Render Barcode Visual to temporary canvas
  if (barcode) {
    const tempCanvas = document.createElement('canvas');
    let format = cfg.barcodeFormat;
    if (!format || format === 'AUTO') {
      const cleanBarcode = barcode.trim();
      format = /^\d{13}$/.test(cleanBarcode) ? 'EAN13'
        : /^\d{8}$/.test(cleanBarcode) ? 'EAN8'
        : /^\d{12}$/.test(cleanBarcode) ? 'UPC'
        : 'CODE128';
    }

    try {
      window.JsBarcode(tempCanvas, barcode.trim(), {
        format: format,
        width: Math.max(1, Math.floor(canvasWidth / 250)),
        height: Math.max(30, Math.floor(canvasHeight * 0.38)),
        displayValue: true,
        fontSize: Math.max(10, Math.round(canvasHeight * 0.11)),
        margin: 0,
        textMargin: 2
      });

      const bcWidth = tempCanvas.width;
      const bcHeight = tempCanvas.height;
      const drawWidth = Math.min(bcWidth, canvasWidth - 12);
      const drawX = (canvasWidth - drawWidth) / 2;

      ctx.drawImage(tempCanvas, drawX, currentY, drawWidth, bcHeight);
      currentY += bcHeight + 4;
    } catch (err) {
      console.warn('JsBarcode render warning:', err);
      // Fallback text if format invalid
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(barcode, canvasWidth / 2, currentY + 20);
      currentY += 28;
    }
  }

  // 3. Draw Price & MRP at bottom
  if ((cfg.showPrice && price !== null && price !== undefined) || (cfg.showMrp && mrp)) {
    const priceFontSize = Math.max(12, Math.round(canvasHeight * 0.14));
    ctx.font = `bold ${priceFontSize}px sans-serif`;
    ctx.textAlign = 'center';

    let priceText = '';
    const numPrice = Number(price);
    const numMrp = Number(mrp);

    if (cfg.showMrp && numMrp > 0 && numMrp > numPrice) {
      priceText = `MRP: ${sym}${numMrp.toFixed(2)}  PRICE: ${sym}${numPrice.toFixed(2)}`;
    } else if (cfg.showPrice && !isNaN(numPrice)) {
      priceText = `PRICE: ${sym}${numPrice.toFixed(2)}`;
    }

    if (priceText) {
      ctx.fillText(priceText, canvasWidth / 2, Math.min(canvasHeight - 6, currentY + priceFontSize));
    }
  }

  return canvas;
}

/**
 * Prints barcode sticker labels.
 * Tries local thermal print hub (ESC/POS raw) first, then falls back to browser iframe print.
 */
export async function printBarcodeLabel({
  name = '',
  barcode = '',
  price = null,
  mrp = null,
  sym = '₹',
  quantity = 1,
  config = null
}) {
  if (!barcode) {
    throw new Error('Barcode value is required for label printing.');
  }

  const cfg = { ...getStoredLabelConfig(), ...(config || {}) };
  const canvas = await generateLabelCanvas({ name, barcode, price, mrp, sym, config: cfg });
  const qty = Math.max(1, parseInt(quantity) || 1);

  // Strategy 1: Silent Raw ESC/POS Thermal Print via CafeQR Print Hub
  if (typeof window !== 'undefined') {
    const printWinUrl = localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3333/printRaw';
    const printerName = localStorage.getItem('PRINT_WIN_PRINTER_NAME_LABEL') || localStorage.getItem('PRINT_WIN_PRINTER_NAME') || '';

    try {
      const escPosBase64 = canvasToEscPosBase64(canvas);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);

      let successCount = 0;
      for (let i = 0; i < qty; i++) {
        const resp = await fetch(printWinUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printerName: printerName || undefined, dataBase64: escPosBase64 }),
          signal: ctrl.signal
        });
        if (resp.ok) successCount++;
      }
      clearTimeout(t);
      if (successCount > 0) {
        console.log(`[BarcodeLabel] Printed ${successCount} label(s) via ESC/POS raw print hub.`);
        return true;
      }
    } catch (err) {
      console.warn('[BarcodeLabel] Thermal print hub fallback to browser dialog:', err);
    }
  }

  // Strategy 2: Fallback to browser iframe print (for standard office inkjet/laser printers)
  const dataUrl = canvas.toDataURL('image/png');
  const widthMm = cfg.widthMm || 50;
  const heightMm = cfg.heightMm || 25;

  const existingIframe = document.getElementById('barcode-print-iframe');
  if (existingIframe) {
    existingIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'barcode-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();

  let imagesHtml = '';
  for (let i = 0; i < qty; i++) {
    imagesHtml += `<img src="${dataUrl}" class="label-img" />`;
  }

  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Barcode Label</title>
        <style>
          @page {
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .label-img {
            width: ${widthMm}mm;
            height: ${heightMm}mm;
            display: block;
            page-break-after: always;
          }
          @media print {
            .label-img {
              page-break-after: always;
            }
          }
        </style>
      </head>
      <body>
        ${imagesHtml}
      </body>
    </html>
  `);
  doc.close();

  return new Promise((resolve) => {
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => {
        iframe.remove();
        resolve(true);
      }, 1000);
    }, 300);
  });
}
