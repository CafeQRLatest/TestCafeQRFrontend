/**
 * Utility for generating and printing thermal barcode sticker labels.
 * Uses JsBarcode (loaded via CDN dynamically if missing) and offscreen canvas
 * to render crisp 203 DPI thermal label images and trigger print via iframe.
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
 * Prints barcode sticker labels via a hidden iframe.
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
  const dataUrl = canvas.toDataURL('image/png');

  const widthMm = cfg.widthMm || 50;
  const heightMm = cfg.heightMm || 25;
  const qty = Math.max(1, parseInt(quantity) || 1);

  // Remove existing print iframe if any
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
