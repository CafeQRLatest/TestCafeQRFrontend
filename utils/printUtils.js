// utils/printUtils.js
// --- PART 1 ---
const ESC = "\x1b";
const GS = "\x1d";

function b(n) {
  return String.fromCharCode(n & 0xff);
}
function b2(n) {
  return b(n & 0xff) + b((n >> 8) & 0xff);
}

// ESC/POS Modes
const MODE_RESET = ESC + "!" + b(0);
const MODE_BOLD = ESC + "E" + b(1);
const MODE_NO_BOLD = ESC + "E" + b(0);
const MODE_DOUBLE = ESC + "!" + b(0x11); // Double-height + Double-width
const MODE_NORMAL = ESC + "!" + b(0);
const MODE_TALL = ESC + "!" + b(0x01); // double-height only

// Alignment Commands
const ALIGN_LEFT = ESC + "a" + b(0);
const ALIGN_CENTER = ESC + "a" + b(1);
const ALIGN_RIGHT = ESC + "a" + b(2);

// character size magnification
const SIZE_1X = GS + "!" + b(0x00); // 1x width, 1x height
const SIZE_2X = GS + "!" + b(0x11); // 2x width, 2x height
const SIZE_2H = GS + "!" + b(0x01); // 1x width, 2x height

const DEFAULT_BILL_FOOTER_TEXT = "Please consume the food within 2 hours";

export function parseDate(raw) {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  let s = String(raw);
  if (s.includes('T') && !s.includes('Z') && !s.includes('+') && !s.includes('-')) {
    s += 'Z';
  }
  const d = new Date(s);
  return isNaN(d) ? new Date() : d;
}

function pickValue(obj, keys, fallback = undefined) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function pickNumber(obj, keys, fallback = 0) {
  const value = Number(pickValue(obj, keys, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function customerDisplay(order) {
  const customers = Array.isArray(order?.customers) ? order.customers : [];
  if (customers.length) {
    return customers
      .map((customer) => {
        const name = String(customer?.name || 'Guest').trim() || 'Guest';
        const phone = String(customer?.phone || '').trim();
        return phone ? `${name} (${phone})` : name;
      })
      .join(', ');
  }
  const custName = String(pickValue(order, ["customer_name", "customerName"], "")).trim();
  const custPhone = String(pickValue(order, ["customer_phone", "customerPhone"], "")).trim();
  return `${custName} ${custPhone ? `(${custPhone})` : ''}`.trim();
}

const ORDER_ITEM_KEYS = ["lines", "orderLines", "lineItems", "order_items", "orderItems", "items"];

function getCategoryName(raw, menu) {
  const category = raw?.category ?? raw?.categoryName ?? raw?.category_name ?? menu?.category ?? menu?.categoryName;
  if (!category) return "";
  if (typeof category === "string") return category;
  return String(category.name || category.categoryName || category.label || "").trim();
}

function normalizeDisplayItem(raw) {
  const menu = raw?.menu_items || raw?.menuItem || raw?.product || raw?.productDto || raw?.item || {};
  const name = String(
    pickValue(
      raw,
      ["productName", "product_name", "product_name_snapshot", "menuItemName", "menu_item_name", "item_name", "itemName", "displayName", "display_name", "name", "description"],
      pickValue(menu, ["name", "productName", "product_name", "menuItemName", "item_name", "itemName", "displayName"], "Item")
    ) || "Item"
  ).trim() || "Item";
  const quantity = pickNumber(raw, ["quantity", "qty"], 1);
  const price = pickNumber(
    raw,
    ["unitPrice", "unit_price", "price", "rate", "unitPriceIncTax", "unit_price_inc_tax"],
    0
  );
  const lineDisc = pickNumber(raw, ["line_discount_amount", "lineDiscountAmount"], 0);
  const orderShare = pickNumber(raw, ["order_discount_share", "orderDiscountShare"], 0);
  const discount = pickNumber(raw, ["discountAmount", "discount_amount"], lineDisc + orderShare);
  const taxAmount = pickNumber(raw, ["taxAmount", "tax_amount"], 0);
  const lineTotal = pickNumber(
    raw,
    ["lineTotal", "line_total", "total", "amount", "totalPrice"],
    price * quantity
  );

  return {
    name,
    variant_name: pickValue(raw, ["variantName", "variant_name", "variantname"], pickValue(menu, ["variantName", "variant_name"], undefined)),
    quantity,
    price,
    line_discount_amount: lineDisc,
    order_discount_share: orderShare,
    discount_amount: discount,
    tax_amount: taxAmount,
    line_total: lineTotal,
    productId: pickValue(raw, ["productId", "product_id", "pid", "id"], pickValue(menu, ["id", "productId"], undefined)),
    is_packaged_good: Boolean(
      pickValue(raw, ["isPackagedGood", "is_packaged_good", "is_packaged"], pickValue(menu, ["isPackagedGood", "is_packaged_good"], false))
    ),
    category: getCategoryName(raw, menu),
    uom_precision: raw?.uom_precision ?? raw?.uomPrecision ?? menu?.uom?.precision,
  };
}

export function toDisplayItems(order) {
  const source = ORDER_ITEM_KEYS
    .map(key => order?.[key])
    .find(items => Array.isArray(items) && items.length > 0);

  if (!source) return [];

  return source
    .map(normalizeDisplayItem)
    .filter(item => item.name || Number(item.quantity) > 0 || Number(item.price) > 0);
}

function getOrderTypeLabel(order) {
  if (!order) return "";
  const tableNumber = pickValue(order, ["table_number", "tableNumber"], null);
  if (tableNumber && tableNumber !== null)
    return `Dine in (Table ${tableNumber})`;
  const type = String(pickValue(order, ["order_type", "orderType", "fulfillment_type", "fulfillmentType"], "")).toLowerCase();
  if (type === "parcel" || type === "takeaway") return "Takeaway";
  if (type === "delivery") return "Delivery";
  if (type === "dine_in" || type === "dine-in") return "Dine in";
  return "";
}

function getKotReference(order) {
  const saleOrderNo = String(pickValue(order, ["order_no", "orderNo", "saleOrderNo", "sale_order_no"], "")).trim();
  if (saleOrderNo) return saleOrderNo;

  return order?.id?.slice(0, 8)?.toUpperCase() || "N/A";
}

function getTableHighlightLabel(order) {
  const tableNumber = String(pickValue(order, ["table_number", "tableNumber"], "")).trim();
  if (tableNumber) return `TABLE: ${tableNumber}`;
  return getOrderTypeLabel(order).toUpperCase();
}

function wrapText(text, width) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (t.length <= width) line = t;
    else {
      if (line) lines.push(line);
      line = w.length > width ? w.slice(0, width) : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function clip(s, w) {
  const x = String(s ?? "");
  return x.length > w ? x.slice(0, w) : x;
}
function rightAlign(s, w) {
  const x = clip(s, w);
  return " ".repeat(Math.max(0, w - x.length)) + x;
}
function rightAlignEnd(s, w) {
  const x = String(s ?? "");
  const y = x.length > w ? x.slice(-w) : x;
  return " ".repeat(Math.max(0, w - y.length)) + y;
}
function leftAlign(s, w) {
  const x = clip(s, w);
  return x + " ".repeat(Math.max(0, w - x.length));
}
function center(s, w) {
  const x = clip(s, w);
  const padL = Math.max(0, Math.floor((w - x.length) / 2));
  return " ".repeat(padL) + x;
}

function kvLine(label, value, W) {
  const l = String(label);
  const v = String(value);
  if (l.length + v.length + 1 > W) return `${l} ${v}`;
  return l + " ".repeat(W - l.length - v.length) + v;
}

function kvLineScaled(label, value, W, scaleW = 1) {
  const effW = Math.max(10, Math.floor(W / scaleW));
  return kvLine(label, value, effW);
}

function pushWrappedCenteredText(lines, text, W, layout) {
  const value = String(text || "").trim();
  if (!value) return;
  value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    wrapText(line, W).forEach((wrapped) => {
      lines.push(withMargins(center(wrapped, W), layout));
    });
  });
}

function getLocalNum(key, fallback = 0) {
  try {
    if (typeof window === "undefined") return fallback;
    const v = Number(window.localStorage.getItem(key) || "");
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function fmtRate(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0";
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function getReceiptWidthCols(restaurantProfile) {
  const fromLocal = getLocalNum("PRINT_WIDTH_COLS", 0);
  const fromProfile = Number(restaurantProfile?.receipt_cols || 0) || 0;
  const paperMm = getLocalNum("PRINT_PAPER_MM", 0);
  const autoDefault = paperMm >= 76 ? 48 : 32;
  const cols = fromLocal || fromProfile || autoDefault;
  return Math.max(20, Math.min(64, cols));
}

function getLayout(restaurantProfile) {
  const cols = getReceiptWidthCols(restaurantProfile);
  const paperMm = getLocalNum("PRINT_PAPER_MM", cols >= 48 ? 80 : 58);
  const dotWidth = paperMm >= 76 ? 576 : 384;
  const defaultMargin = paperMm >= 76 ? 12 : 8;
  const leftDots = getLocalNum("PRINT_LEFT_MARGIN_DOTS", defaultMargin);
  const rightDots = getLocalNum("PRINT_RIGHT_MARGIN_DOTS", defaultMargin);
  const areaDots = Math.max(200, dotWidth - leftDots - rightDots);
  const guardColsDefault = paperMm >= 76 ? 0 : 1;
  const guardCols = getLocalNum("PRINT_GUARD_COLS", guardColsDefault);
  const safeCols = getLocalNum("PRINT_SAFE_COLS", 0);
  const charDots = 12;
  const maxColsFromDots = Math.floor(areaDots / charDots);
  const marginCols = 0;
  const innerCols = Math.max(16, Math.min(cols - guardCols - safeCols, maxColsFromDots));

  return {
    cols,
    innerCols,
    marginCols,
    paperMm,
    dotWidth,
    leftDots,
    rightDots,
    areaDots,
    guardCols,
    maxColsFromDots,
  };
}

function withMargins(line, layout) {
  return " ".repeat(layout.marginCols) + clip(line, layout.innerCols);
}

function escposPageSetup(layout) {
  return (
    ESC + "@" + // reset
    ESC + " " + b(0) +   // ESC SP n: right-side character spacing = 0
    ESC + "a" + b(0) + // left align (default)
    GS + "L" + b2(layout.leftDots) + // left margin
    GS + "W" + b2(layout.areaDots) + // printable area width
    ESC + "M" + b(0) + // Font A
    ESC + "E" + b(0) // bold off
  );
}

function buildLogoEscPos(restaurantProfile) {
  const bits = restaurantProfile?.print_logo_bitmap;
  const cols = Number(restaurantProfile?.print_logo_cols || 0);
  const rows = Number(restaurantProfile?.print_logo_rows || 0);
  if (!bits || !cols || !rows || bits.length !== cols * rows) return "";
  const bytesPerRow = Math.ceil(cols / 8);
  let out = "";
  out += ALIGN_CENTER;
  out += GS + "v" + "0" + b(0) + b2(bytesPerRow) + b2(rows);
  for (let y = 0; y < rows; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < cols && bits[y * cols + x] === "1") byte |= 0x80 >> bit;
      }
      out += b(byte);
    }
  }
  out += "\r\n";
  out += ALIGN_LEFT;
  return out;
}

function getBillCols(innerW, hasDiscount) {
  const showDiscCol = false; 
  const gaps = showDiscCol ? 4 : 3;
  let qty = innerW >= 44 ? 6 : innerW >= 38 ? 6 : 4;
  let rate = innerW >= 44 ? 7 : innerW >= 38 ? 7 : 6;
  let disc = showDiscCol ? (innerW >= 44 ? 7 : 6) : 0;
  let total = innerW >= 44 ? 8 : innerW >= 38 ? 7 : 6;
  const fixed = qty + rate + total + disc + gaps;
  let name = innerW - fixed;
  if (name < 8) {
    qty = 3; rate = 5; disc = 0; total = 6;
    const fixed2 = qty + rate + total + disc + gaps;
    name = Math.max(6, innerW - fixed2);
  }
  return { name, qty, rate, disc, total, showDiscCol };
}

export function buildKotText(order, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
    const removedItems = Array.isArray(order?.removed_items)
      ? order.removed_items.filter((ri) => Number(ri.quantity) > 0)
      : [];

    const layout = getLayout(restaurantProfile);
    const W = layout.innerCols;
    const dashes = () => "-".repeat(W);

    const restaurantName = String(
      restaurantProfile?.restaurant_name ||
      order?.restaurant_name ||
      "RESTAURANT"
    ).toUpperCase();

    const kotReference = getKotReference(order);
    const tableLabel = getTableHighlightLabel(order);

    const orderDate = parseDate(pickValue(order, ["created_at", "createdAt", "order_date", "orderDate"], Date.now()));
    const dateStr = orderDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = orderDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const qtyW = 6;
    const nameW = Math.max(10, W - (qtyW + 1));
    const lines = [];

    const is80 = layout.paperMm >= 76;
    lines.push(ALIGN_CENTER);
    lines.push(MODE_BOLD + (is80 ? SIZE_2X : SIZE_1X) + restaurantName + SIZE_1X + MODE_NO_BOLD);
    lines.push(ALIGN_LEFT);
    lines.push(withMargins(dashes(), layout));
    lines.push(withMargins(center("*** KOT ***", W), layout));
    lines.push(withMargins(`${dateStr} ${timeStr}`, layout));
    lines.push(withMargins(`KOT Ref: ${kotReference}`, layout));
    const dailyBillNo = pickValue(order, ["dailyBillNo", "daily_bill_no"], null);
    if (dailyBillNo) {
      lines.push(withMargins(`Daily Bill No: ${dailyBillNo}`, layout));
    }
    const staffName = String(pickValue(order, ["taken_by_name", "takenByName"], '')).trim();
    if (staffName) {
      lines.push(withMargins(`Attended by: ${staffName}`, layout));
    }
    const customerCount = pickValue(order, ["number_of_customers", "numberOfCustomers", "numberofcustomers"], null);
    if (customerCount)
      lines.push(withMargins(`No. of Customers: ${customerCount}`, layout));

    const customerText = customerDisplay(order);
    const inst = String(pickValue(order, ["special_instructions", "specialInstructions", "instructions"], "")).trim();

    if (customerText) lines.push(withMargins(`Customer: ${customerText}`, layout));
    if (inst) {
      lines.push(withMargins(dashes(), layout));
      inst.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
        wrapText(line, W).forEach(wl => {
          lines.push(withMargins(wl, layout));
        });
      });
    }

    lines.push(withMargins(dashes(), layout));

    if (tableLabel) {
      lines.push(ALIGN_CENTER);
      lines.push(MODE_BOLD + SIZE_2X + tableLabel + SIZE_1X + MODE_NO_BOLD);
      lines.push(ALIGN_LEFT);
      lines.push(withMargins(dashes(), layout));
    }

    if (items.length) {
      const itemScale = is80 ? 2 : 1;
      const itemCols = Math.max(16, Math.floor(W / itemScale));
      const itemQtyW = is80 ? 4 : qtyW;
      const itemNameW = Math.max(8, itemCols - itemQtyW - 1);

      lines.push(withMargins(leftAlign("ITEM", itemNameW) + " " + rightAlign("QTY", itemQtyW), layout));
      lines.push(withMargins(dashes(), layout));
      lines.push(MODE_BOLD + (is80 ? SIZE_2X : SIZE_1X));
      items.forEach((it) => {
        const displayName = it.variant_name ? `${it.name} (${it.variant_name})` : it.name;
        const nameLines = wrapText(displayName || "Item", itemNameW);
        const qtyNum = Number(it?.quantity || 1);
        const p = Number.isInteger(it?.uom_precision) ? it.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
        if (!nameLines.length) return;
        const qty = rightAlign(qtyNum.toFixed(p), itemQtyW);
        lines.push(withMargins(leftAlign(nameLines[0], itemNameW) + " " + qty, layout));
        for (let i = 1; i < nameLines.length; i++) lines.push(withMargins(nameLines[i], layout));
      });
      lines.push(SIZE_1X + MODE_NO_BOLD);
    }

    if (removedItems.length) {
      lines.push(withMargins(dashes(), layout));
      lines.push(withMargins(center("*** REMOVED ITEMS ***", W), layout));
      lines.push(withMargins(leftAlign("ITEM", nameW) + " " + rightAlign("QTY", qtyW), layout));
      lines.push(MODE_BOLD);
      removedItems.forEach((ri) => {
        const displayName = ri.variant_name ? `${ri.name} (${ri.variant_name})` : ri.name;
        const nameLines = wrapText(displayName || "Item", nameW);
        const qtyNum = Number(ri?.quantity || 1);
        const p = Number.isInteger(ri?.uom_precision) ? ri.uom_precision : qtyNum % 1 === 0 ? 0 : 2;
        if (!nameLines.length) return;
        const qty = rightAlign(qtyNum.toFixed(p), qtyW);
        lines.push(withMargins(leftAlign("- " + nameLines[0], nameW) + " " + qty, layout));
        for (let i = 1; i < nameLines.length; i++) lines.push(withMargins("  " + nameLines[i], layout));
      });
      lines.push(MODE_NO_BOLD);
    }

    lines.push(withMargins(dashes(), layout));
    lines.push(withMargins(center("*** SEND TO KITCHEN ***", W), layout));
    lines.push("");

    return escposPageSetup(layout) + lines.join("\n");
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    const text = buildReceiptText(order, bill, restaurantProfile)
      .replace(/[\x00-\x1f\x7f]/g, (c) => c === "\n" || c === "\r" || c === "\t" ? c : "")
      .trim();
    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || "N/A";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BILL-${orderId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true, method: "download" };
  } catch (error) {
    console.error(error);
    return { success: false, error: error?.message || String(error) };
  }
}

export function buildReceiptText(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
    const layout = getLayout(restaurantProfile);
    const W = layout.innerCols;
    const dashes = () => "-".repeat(W);

    const restaurantName = String(
      restaurantProfile?.restaurant_name ||
      order?.restaurant_name ||
      "RESTAURANT"
    ).toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_address_line2,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_address_state,
      restaurantProfile?.shipping_pincode,
    ].filter(Boolean);
    const address = addressParts.length ? addressParts.join(", ") : order?.restaurant_address || "";

    const phone = restaurantProfile?.shipping_phone || restaurantProfile?.phone || order?.restaurant_phone || "";
    const orderType = getOrderTypeLabel(order);
    const invoiceNo = pickValue(bill, ["invoice_no", "invoiceNo"], pickValue(order, ["invoice_no", "invoiceNo"], ""));
    const billNo = pickValue(bill, ["bill_no", "billNo"], pickValue(order, ["bill_no", "billNo"], ""));

    const orderDate = parseDate(pickValue(order, ["created_at", "createdAt", "order_date", "orderDate"], Date.now()));
    const dateStr = orderDate.toLocaleDateString("en-IN");
    const timeStr = orderDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const orderDiscount = pickNumber(order, ["discount_amount", "discountAmount", "totalDiscountAmount"], pickNumber(bill, ["discount_amount", "discountAmount"], 0));
    const roundOff = pickNumber(order, ["round_off_amount", "roundOffAmount"], pickNumber(bill, ["round_off_amount", "roundOffAmount"], 0));
    const oTotalTax = pickNumber(order, ["total_tax", "totalTax", "totalTaxAmount"], pickNumber(bill, ["total_tax", "totalTax", "tax_total", "taxTotal"], 0));
    const oGrandTotal = pickNumber(order, ["grandTotal", "grand_total", "total_amount", "totalAmount"], pickNumber(bill, ["grandTotal", "grand_total", "total_amount", "totalAmount"], 0));
    const isInclusiveOrder = (order?.prices_include_tax === true || order?.pricesIncludeTax === true || bill?.prices_include_tax === true || bill?.pricesIncludeTax === true);
    const isAllPackaged = items.length > 0 && items.every(it => it.is_packaged_good);
    const isInclusiveMode = isAllPackaged || isInclusiveOrder;

    const hasLineDiscount = items.some((it) => Number(it.discount_amount || 0) > 0.001);
    const billFooterEnabled = !(restaurantProfile?.bill_footer_enabled === false || restaurantProfile?.bill_footer_enabled === "false" || restaurantProfile?.bill_footer_enabled === 0);
    const billFooterText = String(restaurantProfile?.bill_footer_text || "").trim() || DEFAULT_BILL_FOOTER_TEXT;

    const cols = getBillCols(W, hasLineDiscount);
    const { name, qty, rate, disc, total, showDiscCol } = cols;
    const lines = [];
    const is80 = layout.paperMm >= 76;

    lines.push(ALIGN_CENTER);
    lines.push(MODE_BOLD + (is80 ? SIZE_2X : SIZE_1X) + restaurantName + SIZE_1X + MODE_NO_BOLD);
    lines.push(ALIGN_LEFT);

    wrapText(address, W).forEach((l) => lines.push(withMargins(center(l, W), layout)));
    if (phone) lines.push(withMargins(center(`Contact No.: ${phone}`, W), layout));
    if (restaurantProfile?.fssai_license) lines.push(withMargins(center(`FSSAI: ${restaurantProfile.fssai_license}`, W), layout));
    if ((restaurantProfile?.gst_enabled || restaurantProfile?.gst_enabled === 'true') && restaurantProfile?.gstin) {
      lines.push(withMargins(center(`GSTIN: ${restaurantProfile.gstin}`, W), layout));
    }
    lines.push(withMargins(dashes(), layout));
    lines.push(withMargins(`${dateStr} ${timeStr}`, layout));
    if (invoiceNo) lines.push(withMargins(`Invoice: ${invoiceNo}`, layout));
    if (billNo) lines.push(withMargins(`Bill No: ${billNo}`, layout));
    const dailyBillNo = pickValue(bill, ["dailyBillNo", "daily_bill_no"], pickValue(order, ["dailyBillNo", "daily_bill_no"], null));
    if (dailyBillNo) {
      lines.push(withMargins(`Daily Bill No: ${dailyBillNo}`, layout));
    }
    if (orderType) lines.push(withMargins(`Order Type: ${orderType}`, layout));

    const customerText = customerDisplay(order);
    if (customerText) lines.push(withMargins(`Customer: ${customerText}`, layout));

    lines.push(withMargins(dashes(), layout));
    let header = leftAlign("ITEM", name) + " " + rightAlign("QTY", qty) + " " + rightAlign("RATE", rate);
    if (showDiscCol) header += " " + rightAlign("DISC", disc);
    header += " " + rightAlign("TOTAL", total);
    lines.push(withMargins(header, layout));
    lines.push(withMargins(dashes(), layout));

    items.forEach((it) => {
      const qtyNum = Number(it.quantity || 1);
      const rateNum = Number(it.price || 0);
      const lineTotalNum = Number.isFinite(Number(it.line_total)) ? Number(it.line_total) : rateNum * qtyNum;
      const nameLines = wrapText(it.variant_name ? `${it.name} (${it.variant_name})` : it.name, name);
      const qtyStr = Number.isInteger(qtyNum) ? qtyNum.toString() : qtyNum.toFixed(2);
      const totalStr = lineTotalNum.toFixed(2);
      let row = leftAlign(nameLines[0], name) + " " + rightAlignEnd(qtyStr, qty) + " " + rightAlignEnd(fmtRate(rateNum), rate);
      if (showDiscCol) row += " " + rightAlignEnd("", disc);
      row += " " + rightAlignEnd(totalStr, total);
      lines.push(withMargins(row, layout));
      for (let i = 1; i < nameLines.length; i++) lines.push(withMargins(nameLines[i], layout));
    });

    lines.push(withMargins(dashes(), layout));
    const itemsGrossTotal = items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
    lines.push(withMargins(kvLine(isInclusiveMode ? "Items Total:" : "Gross Total:", fmtRate(itemsGrossTotal), W), layout));

    const totalReduction = items.reduce((s, it) => s + (Number(it.discount_amount || 0) - Number(it.order_discount_share || 0)), 0) + orderDiscount;
    if (totalReduction > 0.01) lines.push(withMargins(kvLine("Discount:", "-" + fmtRate(totalReduction), W), layout));
    if (!isInclusiveMode) {
      const subEx = (oGrandTotal - roundOff) - oTotalTax;
      lines.push(withMargins(kvLine("Subtotal:", fmtRate(subEx), W), layout));
    }
    if (oTotalTax > 0.01) {
      const c = Math.round((oTotalTax / 2) * 100) / 100;
      const s = Math.round((oTotalTax / 2) * 100) / 100;
      lines.push(withMargins(kvLine(`CGST ${isInclusiveOrder ? "(incl)" : ""}:`, fmtRate(c), W), layout));
      lines.push(withMargins(kvLine(`SGST ${isInclusiveOrder ? "(incl)" : ""}:`, fmtRate(s), W), layout));
    }
    if (roundOff !== 0) lines.push(withMargins(kvLine("Round Off:", (roundOff > 0 ? "+" : "") + fmtRate(roundOff), W), layout));
    lines.push(withMargins(dashes(), layout));
    lines.push(MODE_BOLD + (is80 ? SIZE_2X : SIZE_2X) + withMargins(kvLineScaled("TOTAL:", fmtRate(oGrandTotal), W, 2), layout) + SIZE_1X + MODE_NO_BOLD);
    lines.push(withMargins(dashes(), layout));

    if (billFooterEnabled) pushWrappedCenteredText(lines, billFooterText, W, layout);
    pushWrappedCenteredText(lines, "* THANK YOU! VISIT AGAIN !! *", W, layout);
    pushWrappedCenteredText(lines, "Powered by Cafe QR", W, layout);
    lines.push("");

    return escposPageSetup(layout) + buildLogoEscPos(restaurantProfile) + lines.join("\n");
  } catch (e) {
    console.error(e);
    return "PRINT ERROR";
  }
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}



