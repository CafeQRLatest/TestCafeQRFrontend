import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import axios from 'axios';
import { 
  FaFilePdf, 
  FaPrint, 
  FaShareAlt, 
  FaCheckCircle, 
  FaStar, 
  FaPhoneAlt, 
  FaWhatsapp, 
  FaStore, 
  FaLeaf, 
  FaReceipt 
} from 'react-icons/fa';
import { getApiUrl } from '../../utils/api';
import { downloadPublicInvoicePdf } from '../../utils/invoicePdf';

export default function PublicInvoicePage() {
  const router = useRouter();
  const { orderId } = router.query;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    if (!router.isReady || !orderId) return;

    let isMounted = true;
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        setError(null);
        const baseUrl = getApiUrl();
        const res = await axios.get(`${baseUrl}/api/v1/public/invoices/view/${orderId}`);
        if (isMounted) {
          if (res.data?.success && res.data?.data) {
            setInvoice(res.data.data);
          } else {
            setError(res.data?.message || 'Invoice details could not be retrieved.');
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('[PublicInvoice] Error fetching invoice:', err);
          setError(err.response?.data?.message || 'Invoice not found or expired.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInvoice();
    return () => { isMounted = false; };
  }, [router.isReady, orderId]);

  const handleDownloadPdf = async () => {
    if (!invoice || downloadingPdf) return;
    try {
      setDownloadingPdf(true);
      await downloadPublicInvoicePdf(invoice);
    } catch (err) {
      console.error('[PublicInvoice] PDF generation failed:', err);
      alert('Unable to generate PDF invoice. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Tax Invoice - ${invoice?.storeName || 'Cafe QR POS'}`,
          text: `Invoice #${invoice?.invoiceNo || ''} from ${invoice?.storeName || 'Cafe QR POS'}. Total: ${invoice?.currencySymbol || '₹'} ${Number(invoice?.grandTotal || 0).toFixed(2)}`,
          url: window.location.href,
        });
        return;
      } catch (err) {
        // Fallback to clipboard if user dismissed or cancelled share
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    }
  };

  const formatMoney = (val) => {
    const sym = invoice?.currencySymbol || '₹';
    return `${sym} ${Number(val || 0).toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <Head>
        <title>{invoice?.storeName ? `Tax Invoice | ${invoice.storeName}` : 'Digital Tax Invoice | Cafe QR POS'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="View and download your official tax invoice receipt powered by Cafe QR POS." />
      </Head>

      <div className="ebill-page-container">
        {loading && (
          <div className="ebill-loading-card">
            <div className="ebill-spinner"></div>
            <p>Loading your digital invoice...</p>
          </div>
        )}

        {error && !loading && (
          <div className="ebill-error-card">
            <FaReceipt size={48} color="#ef4444" />
            <h2>Invoice Not Available</h2>
            <p>{error}</p>
            <p className="ebill-subtext">If this order was placed recently, please check back in a few seconds or contact the store.</p>
          </div>
        )}

        {invoice && !loading && (
          <main className="ebill-wrapper">
            {/* Top Brand Banner */}
            <header className="ebill-store-header">
              {invoice.logoUrl ? (
                <img src={invoice.logoUrl} alt={invoice.storeName} className="ebill-store-logo" />
              ) : (
                <div className="ebill-store-avatar">
                  <FaStore size={28} color="#ea580c" />
                </div>
              )}

              <h1 className="ebill-store-title">{invoice.storeName}</h1>

              {invoice.storeAddress && (
                <p className="ebill-store-address">{invoice.storeAddress}</p>
              )}

              <div className="ebill-verified-badge">
                <FaCheckCircle size={13} color="#16a34a" />
                <span>Verified Tax Invoice</span>
              </div>
            </header>

            {/* Sticky Action Bar */}
            <div className="ebill-action-bar no-print">
              <button 
                className="ebill-btn-primary" 
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                id="btn-download-pdf"
              >
                <FaFilePdf size={16} />
                <span>{downloadingPdf ? 'Generating PDF...' : 'Download Official Tax Invoice (PDF)'}</span>
              </button>

              <div className="ebill-btn-row">
                <button className="ebill-btn-secondary" onClick={handlePrint} title="Print Invoice">
                  <FaPrint size={14} />
                  <span>Print</span>
                </button>
                <button className="ebill-btn-secondary" onClick={handleShare} title="Share Link">
                  <FaShareAlt size={14} />
                  <span>{copyFeedback ? 'Link Copied!' : 'Share'}</span>
                </button>
              </div>
            </div>

            {/* The Digital Bill Card */}
            <section className="ebill-receipt-card">
              {/* Receipt Header Strip */}
              <div className="ebill-receipt-strip">
                <div className="ebill-token-box">
                  <span className="ebill-token-label">TOKEN / BILL</span>
                  <span className="ebill-token-num">#{invoice.dailyBillNo || invoice.orderNo || invoice.invoiceNo}</span>
                </div>
                <div className="ebill-meta-box">
                  <div className="ebill-meta-row">
                    <span className="meta-key">Invoice:</span>
                    <span className="meta-val">#{invoice.invoiceNo}</span>
                  </div>
                  <div className="ebill-meta-row">
                    <span className="meta-key">Date:</span>
                    <span className="meta-val">{formatDate(invoice.invoiceDate)}</span>
                  </div>
                  {invoice.fulfillmentType && (
                    <div className="ebill-meta-row">
                      <span className="meta-key">Mode:</span>
                      <span className="meta-val">
                        {invoice.tableNumber ? `Dine-In (Table ${invoice.tableNumber})` : invoice.fulfillmentType}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Greeting if available */}
              {invoice.customerName && (
                <div className="ebill-customer-greeting">
                  Billed to: <strong>{invoice.customerName}</strong>
                  {invoice.customerPhone ? ` (${invoice.customerPhone})` : ''}
                </div>
              )}

              {/* Items List */}
              <div className="ebill-items-table">
                <div className="ebill-table-header">
                  <span className="col-item">ITEM</span>
                  <span className="col-qty">QTY</span>
                  <span className="col-rate">RATE</span>
                  <span className="col-total">TOTAL</span>
                </div>

                <div className="ebill-table-body">
                  {invoice.lines && invoice.lines.map((line, idx) => (
                    <div key={idx} className="ebill-table-row">
                      <div className="col-item">
                        <span className="item-name">{line.productName}</span>
                        {line.description && <span className="item-note">{line.description}</span>}
                      </div>
                      <div className="col-qty">{Number(line.quantity || 1)}</div>
                      <div className="col-rate">{formatMoney(line.unitPrice)}</div>
                      <div className="col-total">{formatMoney(line.lineTotal)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Breakup */}
              <div className="ebill-totals-section">
                {invoice.totalDiscountAmount && Number(invoice.totalDiscountAmount) > 0 && (
                  <>
                    <div className="ebill-total-row">
                      <span>Gross Amount</span>
                      <span>{formatMoney(invoice.grossAmount)}</span>
                    </div>
                    <div className="ebill-total-row discount-row">
                      <span>Discount</span>
                      <span>- {formatMoney(invoice.totalDiscountAmount)}</span>
                    </div>
                  </>
                )}

                <div className="ebill-total-row">
                  <span>Subtotal</span>
                  <span>{formatMoney(invoice.subtotal)}</span>
                </div>

                {/* Tax Breakdown */}
                {invoice.cgstAmount != null && Number(invoice.cgstAmount) > 0 && (
                  <>
                    <div className="ebill-total-row tax-subrow">
                      <span>CGST {invoice.cgstRate ? `(${invoice.cgstRate}%)` : ''}</span>
                      <span>{formatMoney(invoice.cgstAmount)}</span>
                    </div>
                    <div className="ebill-total-row tax-subrow">
                      <span>SGST {invoice.sgstRate ? `(${invoice.sgstRate}%)` : ''}</span>
                      <span>{formatMoney(invoice.sgstAmount)}</span>
                    </div>
                  </>
                )}

                {invoice.cgstAmount == null && invoice.totalTaxAmount && Number(invoice.totalTaxAmount) > 0 && (
                  <div className="ebill-total-row tax-subrow">
                    <span>{invoice.taxLabel || 'Taxes'}</span>
                    <span>{formatMoney(invoice.totalTaxAmount)}</span>
                  </div>
                )}

                {invoice.roundOffAmount && Number(invoice.roundOffAmount) !== 0 && (
                  <div className="ebill-total-row">
                    <span>Round Off</span>
                    <span>{Number(invoice.roundOffAmount) > 0 ? '+' : ''}{formatMoney(invoice.roundOffAmount)}</span>
                  </div>
                )}

                <div className="ebill-grand-total-row">
                  <span>TOTAL PAID</span>
                  <span className="grand-total-val">{formatMoney(invoice.grandTotal)}</span>
                </div>

                {invoice.paymentSplits && invoice.paymentSplits.length > 0 ? (
                  <div className="ebill-splits-card">
                    <div className="ebill-splits-title">
                      <FaCheckCircle size={13} color="#16a34a" />
                      <span>Payment Breakdown (Mixed)</span>
                    </div>
                    <div className="ebill-splits-list">
                      {invoice.paymentSplits.map((sp, idx) => (
                        <div key={idx} className="ebill-split-row">
                          <span className="split-method">{sp.paymentMethod || 'Payment'}</span>
                          <span className="split-amount">{formatMoney(sp.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="ebill-payment-pill">
                    <FaCheckCircle size={14} color="#16a34a" />
                    <span>PAID via {invoice.paymentMethod || 'CASH'}</span>
                  </div>
                )}
              </div>

              {/* Bill Footer note if set */}
              {invoice.billFooter && (
                <div className="ebill-custom-footer">
                  "{invoice.billFooter}"
                </div>
              )}
            </section>

            {/* Interactive Engagement Cards */}
            <div className="ebill-engagement-cards no-print">
              {/* Google Review Card */}
              {invoice.googleMapsUrl && (
                <a 
                  href={invoice.googleMapsUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="ebill-card review-card"
                >
                  <div className="review-stars">
                    <FaStar color="#f59e0b" /><FaStar color="#f59e0b" /><FaStar color="#f59e0b" /><FaStar color="#f59e0b" /><FaStar color="#f59e0b" />
                  </div>
                  <h3>Loved your meal?</h3>
                  <p>Rate your experience on Google Reviews!</p>
                  <span className="review-btn">Leave 5-Star Review &rarr;</span>
                </a>
              )}

              {/* Store Contact & Support */}
              {invoice.storePhone && (
                <div className="ebill-card contact-card">
                  <h4>Contact Restaurant</h4>
                  <div className="contact-actions">
                    <a href={`tel:${invoice.storePhone}`} className="contact-btn phone">
                      <FaPhoneAlt size={14} /> Call Store
                    </a>
                    <a 
                      href={`https://wa.me/${invoice.storePhone.replace(/[^0-9]/g, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="contact-btn whatsapp"
                    >
                      <FaWhatsapp size={16} /> WhatsApp Store
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Legal, Tax & Compliance Footer */}
            <footer className="ebill-compliance-footer">
              {(invoice.gstin || invoice.fssaiNumber) && (
                <div className="compliance-meta">
                  {invoice.gstin && <span><strong>GSTIN:</strong> {invoice.gstin}</span>}
                  {invoice.fssaiNumber && <span><strong>FSSAI:</strong> {invoice.fssaiNumber}</span>}
                </div>
              )}

              <div className="ebill-eco-tag">
                <FaLeaf size={14} color="#16a34a" />
                <span>Go Green – say no to paper bills 🌱</span>
              </div>

              <div className="ebill-powered-by">
                Powered by <strong>Cafe QR POS</strong> ⚡
              </div>
            </footer>
          </main>
        )}
      </div>

      <style jsx>{`
        .ebill-page-container {
          min-height: 100vh;
          background-color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          padding: 16px 12px 40px;
          display: flex;
          justify-content: center;
        }

        .ebill-wrapper {
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
        }

        .ebill-loading-card, .ebill-error-card {
          max-width: 420px;
          margin: 80px auto;
          background: #ffffff;
          padding: 32px 24px;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }

        .ebill-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e2e8f0;
          border-top-color: #ea580c;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .ebill-store-header {
          text-align: center;
          margin-bottom: 16px;
        }

        .ebill-store-logo {
          max-height: 56px;
          max-width: 180px;
          object-fit: contain;
          margin-bottom: 8px;
        }

        .ebill-store-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #ffedd5;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }

        .ebill-store-title {
          font-size: 1.35rem;
          font-weight: 800;
          margin: 0 0 4px;
          color: #0f172a;
          letter-spacing: -0.02em;
        }

        .ebill-store-address {
          font-size: 0.825rem;
          color: #64748b;
          margin: 0 0 8px;
          line-height: 1.3;
        }

        .ebill-verified-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #dcfce7;
          color: #15803d;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 999px;
        }

        .ebill-action-bar {
          background: #ffffff;
          padding: 12px;
          border-radius: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ebill-btn-primary {
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
          color: #ffffff;
          border: none;
          padding: 12px 16px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 3px 8px rgba(234, 88, 12, 0.35);
          transition: all 0.15s ease;
        }

        .ebill-btn-primary:active {
          transform: scale(0.98);
        }

        .ebill-btn-primary:disabled {
          opacity: 0.75;
          cursor: not-allowed;
        }

        .ebill-btn-row {
          display: flex;
          gap: 8px;
        }

        .ebill-btn-secondary {
          flex: 1;
          background: #f8fafc;
          color: #475569;
          border: 1px solid #e2e8f0;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 0.825rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .ebill-btn-secondary:hover {
          background: #f1f5f9;
        }

        /* Skeuomorphic Paper Receipt Card */
        .ebill-receipt-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 18px 16px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.06);
          border: 1px solid #e2e8f0;
          margin-bottom: 16px;
          position: relative;
        }

        .ebill-receipt-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed #cbd5e1;
          padding-bottom: 12px;
          margin-bottom: 12px;
        }

        .ebill-token-box {
          background: #0f172a;
          color: #ffffff;
          padding: 8px 12px;
          border-radius: 8px;
          text-align: center;
        }

        .ebill-token-label {
          display: block;
          font-size: 0.65rem;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }

        .ebill-token-num {
          display: block;
          font-size: 1.15rem;
          font-weight: 900;
        }

        .ebill-meta-box {
          text-align: right;
          font-size: 0.8rem;
        }

        .ebill-meta-row {
          margin-bottom: 2px;
        }

        .meta-key {
          color: #64748b;
          margin-right: 4px;
        }

        .meta-val {
          font-weight: 600;
          color: #1e293b;
        }

        .ebill-customer-greeting {
          font-size: 0.825rem;
          color: #475569;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #f1f5f9;
        }

        .ebill-items-table {
          margin-bottom: 16px;
        }

        .ebill-table-header {
          display: grid;
          grid-template-columns: 1fr 40px 65px 75px;
          font-size: 0.7rem;
          font-weight: 700;
          color: #94a3b8;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 6px;
          margin-bottom: 8px;
          letter-spacing: 0.05em;
        }

        .ebill-table-row {
          display: grid;
          grid-template-columns: 1fr 40px 65px 75px;
          font-size: 0.85rem;
          padding: 6px 0;
          border-bottom: 1px solid #f8fafc;
          align-items: baseline;
        }

        .col-item {
          text-align: left;
          padding-right: 6px;
        }

        .item-name {
          font-weight: 600;
          color: #1e293b;
          display: block;
        }

        .item-note {
          font-size: 0.725rem;
          color: #64748b;
          font-style: italic;
          display: block;
        }

        .col-qty {
          text-align: center;
          color: #475569;
        }

        .col-rate {
          text-align: right;
          color: #64748b;
          font-size: 0.8rem;
        }

        .col-total {
          text-align: right;
          font-weight: 700;
          color: #0f172a;
        }

        .ebill-totals-section {
          border-top: 1px dashed #cbd5e1;
          padding-top: 12px;
        }

        .ebill-total-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
          color: #475569;
          margin-bottom: 4px;
        }

        .discount-row {
          color: #16a34a;
          font-weight: 600;
        }

        .tax-subrow {
          font-size: 0.8rem;
          color: #64748b;
          padding-left: 8px;
        }

        .ebill-grand-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 1.15rem;
          font-weight: 900;
          color: #0f172a;
          border-top: 2px solid #0f172a;
          padding-top: 10px;
          margin-top: 8px;
          margin-bottom: 12px;
        }

        .grand-total-val {
          color: #ea580c;
        }

        .ebill-payment-pill {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #15803d;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .ebill-splits-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 12px;
          margin-top: 4px;
        }

        .ebill-splits-title {
          font-size: 0.72rem;
          font-weight: 800;
          color: #475569;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
          text-transform: uppercase;
          border-bottom: 1px dashed #cbd5e1;
          padding-bottom: 4px;
        }

        .ebill-splits-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ebill-split-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.825rem;
          color: #1e293b;
          padding: 2px 0;
        }

        .split-method {
          font-weight: 600;
          color: #334155;
        }

        .split-amount {
          font-weight: 700;
          color: #0f172a;
        }

        .ebill-custom-footer {
          margin-top: 16px;
          font-size: 0.775rem;
          color: #64748b;
          font-style: italic;
          text-align: center;
          border-top: 1px solid #f1f5f9;
          padding-top: 8px;
        }

        .ebill-engagement-cards {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .ebill-card {
          background: #ffffff;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          border: 1px solid #e2e8f0;
          text-decoration: none;
          color: inherit;
          display: block;
        }

        .review-card {
          text-align: center;
          border-left: 4px solid #f59e0b;
          cursor: pointer;
          transition: transform 0.15s ease;
        }

        .review-card:hover {
          transform: translateY(-2px);
        }

        .review-stars {
          display: flex;
          justify-content: center;
          gap: 4px;
          margin-bottom: 6px;
        }

        .review-card h3 {
          margin: 0 0 2px;
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
        }

        .review-card p {
          margin: 0 0 10px;
          font-size: 0.8rem;
          color: #64748b;
        }

        .review-btn {
          display: inline-block;
          font-size: 0.8rem;
          font-weight: 700;
          color: #d97706;
        }

        .contact-card h4 {
          margin: 0 0 10px;
          font-size: 0.875rem;
          font-weight: 700;
          color: #334155;
          text-align: center;
        }

        .contact-actions {
          display: flex;
          gap: 8px;
        }

        .contact-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
        }

        .contact-btn.phone {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #dbeafe;
        }

        .contact-btn.whatsapp {
          background: #f0fdf4;
          color: #15803d;
          border: 1px solid #dcfce7;
        }

        .ebill-compliance-footer {
          text-align: center;
          font-size: 0.75rem;
          color: #64748b;
        }

        .compliance-meta {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 12px;
          margin-bottom: 8px;
          font-size: 0.725rem;
        }

        .ebill-eco-tag {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-weight: 600;
          color: #16a34a;
          margin-bottom: 8px;
        }

        .ebill-powered-by {
          font-size: 0.7rem;
          color: #94a3b8;
        }

        .ebill-powered-by strong {
          color: #475569;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .ebill-page-container {
            background: #ffffff;
            padding: 0;
          }
          .ebill-receipt-card {
            box-shadow: none;
            border: none;
          }
        }
      `}</style>
    </>
  );
}
