import api from './api';
import { generateInvoicePdfDoc } from './invoicePdf';

/**
 * Sends the customer's WhatsApp bill with the official invoice PDF attached — the same document the POS
 * produces for Sales → Download / Print (generateInvoicePdfDoc). Call it AFTER the order is settled, so
 * the PDF carries the final invoice number, taxes and payments.
 *
 * Pair it with `deferWhatsAppDispatch: true` on the settle / create request so the server does not send a
 * text-only bill first. If the PDF cannot be generated, the bill summary is still sent as text.
 *
 * Never throws; resolves to the API result or null.
 */
export async function sendWhatsAppBillWithPdf({ order, orderId, phone, config = null, logTag = 'whatsapp-bill' }) {
  const id = orderId || order?.id || order?.orderId;
  const targetPhone = phone != null ? String(phone).trim() : '';
  if (!id || !targetPhone) return null;

  let pdfBase64 = null;
  let filename = null;
  try {
    const generated = await generateInvoicePdfDoc({ ...(order || {}), id }, config);
    if (generated?.pdfBase64) {
      pdfBase64 = generated.pdfBase64;
      filename = generated.filename || null;
    }
  } catch (pdfErr) {
    console.warn(`[${logTag}] Could not generate invoice PDF; sending WhatsApp bill without attachment:`, pdfErr);
  }

  try {
    const res = await api.post('/api/v1/whatsapp/send-order-bill', {
      orderId: id,
      phone: targetPhone,
      ...(pdfBase64 ? { pdfBase64, filename } : {}),
    });
    console.log(`[${logTag}] WhatsApp bill dispatched (pdf: ${pdfBase64 ? 'yes' : 'no'}):`, res?.data);
    return res?.data ?? null;
  } catch (waErr) {
    console.warn(`[${logTag}] Could not send WhatsApp bill:`, waErr?.response?.data || waErr?.message || waErr);
    return null;
  }
}
