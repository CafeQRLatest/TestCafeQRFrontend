import React, { useState, useMemo } from 'react';
import { FaPrint, FaUtensils, FaReceipt } from 'react-icons/fa';
import { bitmapToPngBase64 } from '../utils/logoBitmap';

export default function PrintLivePreview({ config }) {
  const [activePreview, setActivePreview] = useState('receipt'); // 'receipt', 'kot', 'regular'

  const receiptTemplate = config?.receiptTemplate || config?.thermalTemplate || {};
  const kotTemplate = config?.kotTemplate || config?.thermalTemplate || {};
  const regularTemplate = config?.regularTemplate || {};
  const receiptHeader = receiptTemplate.header ?? receiptTemplate.receiptHeader;
  const receiptFooter = receiptTemplate.footer ?? receiptTemplate.receiptFooter;
  const kotHeader = kotTemplate.header ?? kotTemplate.kotHeader;
  const kotFooter = kotTemplate.footer ?? kotTemplate.kotFooter;
  const receiptTitleFont = receiptTemplate.titleFontSize || 'DOUBLE';
  const receiptBodyFont = receiptTemplate.fontSize || 'NORMAL';
  const kotTitleFont = kotTemplate.titleFontSize || kotTemplate.kotTitleFontSize || 'DOUBLE';
  const kotBodyFont = kotTemplate.fontSize || kotTemplate.kotFontSize || 'NORMAL';
  const activeThermalTemplate = activePreview === 'kot' ? kotTemplate : receiptTemplate;
  const paperWidthMm = Number(activeThermalTemplate.widthMm || 58);
  const paperMaxWidth = `${Math.max(230, Math.min(360, Math.round((paperWidthMm / 80) * 310)))}px`;

  // Convert logo bitmap to image data URL if present
  const logoSrc = useMemo(() => {
    if (config?.print_logo_bitmap && config?.print_logo_cols && config?.print_logo_rows) {
      return bitmapToPngBase64(config.print_logo_bitmap, config.print_logo_cols, config.print_logo_rows);
    }
    return null;
  }, [config?.print_logo_bitmap, config?.print_logo_cols, config?.print_logo_rows]);

  // CSS mappings for ESC/POS font sizes in HTML preview
  const getFontClass = (font) => {
    switch (font) {
      case 'DOUBLE':
        return 'font-double';
      case 'DOUBLE_HEIGHT':
        return 'font-double-height';
      case 'DOUBLE_WIDTH':
        return 'font-double-width';
      case 'NORMAL':
      default:
        return 'font-normal';
    }
  };

  return (
    <div className="preview-container">
      {/* Selector Tabs */}
      <div className="preview-tabs">
        <button 
          className={`preview-tab-btn ${activePreview === 'receipt' ? 'active' : ''}`}
          onClick={() => setActivePreview('receipt')}
        >
          <FaReceipt /> Receipt (Thermal)
        </button>
        <button 
          className={`preview-tab-btn ${activePreview === 'kot' ? 'active' : ''}`}
          onClick={() => setActivePreview('kot')}
        >
          <FaUtensils /> KOT (Thermal)
        </button>
        <button 
          className={`preview-tab-btn ${activePreview === 'regular' ? 'active' : ''}`}
          onClick={() => setActivePreview('regular')}
        >
          <FaPrint /> Invoice (A4)
        </button>
      </div>

      {/* Simulated Viewport */}
      <div className={`paper-viewport ${activePreview === 'regular' ? 'viewport-regular' : ''}`}>
        <div
          className={`paper-strip ${activePreview === 'regular' ? 'regular-page-strip' : ''} ${activePreview === 'regular' && regularTemplate.orientation === 'LANDSCAPE' ? 'landscape' : ''}`}
          style={activePreview === 'regular' ? undefined : { maxWidth: paperMaxWidth }}
        >
          {activePreview !== 'regular' && <div className="paper-edge-top"></div>}
          
          <div className="paper-content">
            {activePreview === 'receipt' && (
              /* ================= RECEIPT VIEW ================= */
              <div className="receipt-view">
                
                {/* Logo */}
                {logoSrc && (
                  <div className="receipt-logo-container">
                    <img src={logoSrc} alt="Restaurant Logo" className="receipt-logo" />
                  </div>
                )}

                {/* Restaurant Name */}
                {receiptTemplate.showRestaurantName !== false && (
                  <div className={`restaurant-name ${getFontClass(receiptTitleFont)}`}>
                    MY CAFE RESTAURANT
                  </div>
                )}

                {/* Restaurant Address & License Info */}
                <div className="restaurant-details text-center font-small">
                  <div>123 Gourmet Boulevard, Food District</div>
                  <div>Phone: +91 98765 43210</div>
                  {receiptTemplate.showFssai !== false && (
                    <div className="license-info">FSSAI: 12345678901234</div>
                  )}
                  {receiptTemplate.showGstBreakdown !== false && (
                    <div className="license-info">GSTIN: 29AAAAA1111A1Z1</div>
                  )}
                </div>

                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* Order Details */}
                <div className="order-meta text-left font-small">
                  <div>Date: 16/06/2026 02:45 PM</div>
                  <div>Invoice: INV-2026-0842</div>
                  <div>Bill No: B-941</div>
                  {receiptTemplate.showDailyBillNo !== false && (
                    <div className="highlight-line">Daily Bill No: #042</div>
                  )}
                  {receiptTemplate.showTableLabel !== false && (
                    <div className="highlight-line">Order Type: Dine in (Table 5)</div>
                  )}
                  {receiptTemplate.showCustomerDetails !== false && (
                    <div className="customer-info">
                      Customer: John Doe (+91 99999 88888)
                    </div>
                  )}
                </div>

                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* Header Custom Text */}
                {receiptHeader && (
                  <div className="custom-header-text text-center">
                    {receiptHeader}
                  </div>
                )}

                {receiptHeader && (
                  <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
                )}

                {/* Items Table Header */}
                <div className="items-table header font-small">
                  <span className="col-item text-left">ITEM</span>
                  <span className="col-qty text-right">QTY</span>
                  <span className="col-rate text-right">RATE</span>
                  <span className="col-total text-right">TOTAL</span>
                </div>
                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* Items Table Body */}
                <div className={`items-list ${getFontClass(receiptBodyFont)}`}>
                  <div className="items-row">
                    <div className="col-item text-left">
                      Chicken Biryani
                      <span className="item-variant">Double Masala</span>
                    </div>
                    <span className="col-qty text-right">1</span>
                    <span className="col-rate text-right">250.00</span>
                    <span className="col-total text-right">250.00</span>
                  </div>
                  
                  <div className="items-row">
                    <div className="col-item text-left">
                      Paneer Butter Masala
                    </div>
                    <span className="col-qty text-right">2</span>
                    <span className="col-rate text-right">180.00</span>
                    <span className="col-total text-right">360.00</span>
                  </div>
                  
                  <div className="items-row">
                    <div className="col-item text-left">
                      Garlic Naan
                      <span className="item-variant">Butter</span>
                    </div>
                    <span className="col-qty text-right">4</span>
                    <span className="col-rate text-right">40.00</span>
                    <span className="col-total text-right">160.00</span>
                  </div>
                </div>

                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* Pricing Calculation Summary */}
                <div className="totals-summary font-small">
                  <div className="total-row">
                    <span>Gross Total:</span>
                    <span>770.00</span>
                  </div>
                  <div className="total-row">
                    <span>Discount:</span>
                    <span>-77.00</span>
                  </div>
                  
                  {receiptTemplate.showGstBreakdown !== false && (
                    <>
                      <div className="total-row">
                        <span>CGST (2.5%):</span>
                        <span>17.33</span>
                      </div>
                      <div className="total-row">
                        <span>SGST (2.5%):</span>
                        <span>17.33</span>
                      </div>
                    </>
                  )}
                  
                  <div className="total-row">
                    <span>Round Off:</span>
                    <span>+0.34</span>
                  </div>
                  
                  <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
                  
                  <div className="grand-total-row">
                    <span>GRAND TOTAL:</span>
                    <span>₹728.00</span>
                  </div>
                </div>

                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* Footer Custom Texts */}
                {receiptFooter && (
                  <div className="custom-footer-text text-center">
                    {receiptFooter}
                  </div>
                )}
                
                {config.bill_footer && (
                  <div className="bill-footer-msg text-center font-small">
                    {config.bill_footer}
                  </div>
                )}

                <div className="powered-by text-center font-small">
                  Powered by Cafe QR
                </div>

              </div>
            )}

            {activePreview === 'kot' && (
              /* ================= KOT VIEW ================= */
              <div className="kot-view">
                
                {/* Restaurant Name on KOT */}
                {kotTemplate.showRestaurantName !== false && (
                  <div className={`restaurant-name ${getFontClass(kotTitleFont)}`}>
                    MY CAFE RESTAURANT
                  </div>
                )}

                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
                
                {/* KOT Custom Header */}
                {kotHeader && (
                  <div className="custom-header-text text-center">
                    {kotHeader}
                  </div>
                )}
                
                {kotHeader && (
                  <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
                )}

                {/* KOT Meta Info */}
                <div className="order-meta text-left font-small">
                  <div>Date: 16/06/2026 02:45 PM</div>
                  <div>KOT Ref: KOT-842A</div>
                  {kotTemplate.showDailyBillNo !== false && (
                    <div>Daily Bill No: #042</div>
                  )}
                  <div>Attended by: Cashier Sam</div>
                  {kotTemplate.showCustomerDetails !== false && (
                    <div className="customer-info">
                      Customer: John Doe
                    </div>
                  )}
                </div>

                {/* Special Instructions */}
                <div className="special-instructions text-left font-small">
                  <div className="inst-label">Instructions:</div>
                  <div className="inst-content">Make Paneer Butter Masala extra spicy. Naan should be crisp.</div>
                </div>

                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* Table Highlight (KOT Title Font) */}
                {kotTemplate.showTableLabel !== false && (
                  <div className={`kot-table-label text-center ${getFontClass(kotTitleFont)}`}>
                    TABLE: 5
                  </div>
                )}

                {kotTemplate.showTableLabel !== false && (
                  <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>
                )}

                {/* KOT Items List Header */}
                <div className="kot-table-header font-small">
                  <span className="col-item text-left">ITEM</span>
                  <span className="col-qty text-right">QTY</span>
                </div>
                
                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* KOT Items Table Body */}
                <div className={`kot-items-list ${getFontClass(kotBodyFont)}`}>
                  <div className="items-row font-bold">
                    <div className="col-item text-left">
                      Chicken Biryani
                      <span className="item-variant">Double Masala</span>
                    </div>
                    <span className="col-qty text-right">1</span>
                  </div>
                  
                  <div className="items-row font-bold">
                    <div className="col-item text-left">
                      Paneer Butter Masala
                    </div>
                    <span className="col-qty text-right">2</span>
                  </div>
                  
                  <div className="items-row font-bold">
                    <div className="col-item text-left">
                      Garlic Naan
                      <span className="item-variant">Butter</span>
                    </div>
                    <span className="col-qty text-right">4</span>
                  </div>
                </div>

                <div className="receipt-divider">- - - - - - - - - - - - - - - - - - - -</div>

                {/* KOT Custom Footer */}
                {kotFooter && (
                  <div className="custom-footer-text text-center">
                    {kotFooter}
                  </div>
                )}

              </div>
            )}

            {activePreview === 'regular' && (
              /* ================= REGULAR (A4) VIEW ================= */
              <div className="regular-view">
                <div className="regular-header">
                  {regularTemplate.showLogo && logoSrc && (
                    <img src={logoSrc} alt="Logo" className="regular-logo" />
                  )}
                  <div className="regular-restaurant-info">
                    <div className="regular-restaurant-name">MY CAFE RESTAURANT</div>
                    <div className="regular-restaurant-sub">123 Gourmet Boulevard, Food District</div>
                    <div className="regular-restaurant-sub">Phone: +91 98765 43210</div>
                  </div>
                </div>
                
                <div className="regular-title">TAX INVOICE</div>
                
                <div className="regular-meta-grid">
                  <div>
                    <strong>Invoice To:</strong>
                    {regularTemplate.showCustomer ? (
                      <div>John Doe (+91 99999 88888)</div>
                    ) : (
                      <div>Walk-in Customer</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div><strong>Invoice No:</strong> INV-2026-0842</div>
                    <div><strong>Date:</strong> 16 Jun 2026</div>
                  </div>
                </div>
                
                <table className="regular-items-table">
                  <thead>
                    <tr>
                      <th>Sl.</th>
                      <th className="text-left">Item Description</th>
                      {regularTemplate.showHsnSac && <th>HSN/SAC</th>}
                      {regularTemplate.showUnits && <th>Unit</th>}
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      {regularTemplate.showDiscounts && <th className="text-right">Disc</th>}
                      {regularTemplate.showTax && <th className="text-right">GST</th>}
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1</td>
                      <td className="text-left">Chicken Biryani (Double Masala)</td>
                      {regularTemplate.showHsnSac && <td>9963</td>}
                      {regularTemplate.showUnits && <td>Pcs</td>}
                      <td className="text-right">1</td>
                      <td className="text-right">250.00</td>
                      {regularTemplate.showDiscounts && <td className="text-right">25.00</td>}
                      {regularTemplate.showTax && <td className="text-right">5.63</td>}
                      <td className="text-right">250.00</td>
                    </tr>
                    <tr>
                      <td>2</td>
                      <td className="text-left">Paneer Butter Masala</td>
                      {regularTemplate.showHsnSac && <td>9963</td>}
                      {regularTemplate.showUnits && <td>Pcs</td>}
                      <td className="text-right">2</td>
                      <td className="text-right">180.00</td>
                      {regularTemplate.showDiscounts && <td className="text-right">36.00</td>}
                      {regularTemplate.showTax && <td className="text-right">8.10</td>}
                      <td className="text-right">360.00</td>
                    </tr>
                  </tbody>
                </table>
                
                <div className="regular-totals-section">
                  <div className="regular-totals-left">
                    {regularTemplate.showTerms && (
                      <div className="regular-terms">
                        <strong>Terms & Conditions:</strong>
                        <div className="terms-pre">{regularTemplate.terms || '1. Goods once sold will not be taken back.\n2. Pay upon receipt.'}</div>
                      </div>
                    )}
                  </div>
                  <div className="regular-totals-right">
                    <div className="regular-total-row">
                      <span>Subtotal:</span>
                      <span>610.00</span>
                    </div>
                    {regularTemplate.showDiscounts && (
                      <div className="regular-total-row">
                        <span>Discount:</span>
                        <span>-61.00</span>
                      </div>
                    )}
                    {regularTemplate.showTax && (
                      <>
                        <div className="regular-total-row">
                          <span>CGST (2.5%):</span>
                          <span>13.73</span>
                        </div>
                        <div className="regular-total-row">
                          <span>SGST (2.5%):</span>
                          <span>13.73</span>
                        </div>
                      </>
                    )}
                    <div className="regular-total-row grand">
                      <span>Grand Total:</span>
                      <span>₹576.46</span>
                    </div>
                    {regularTemplate.showAmountInWords && (
                      <div className="amount-words">Rupees Five Hundred Seventy-Six and Forty-Six Paise Only</div>
                    )}
                  </div>
                </div>
                
                {regularTemplate.showSignature && (
                  <div className="regular-signature">
                    <div className="sig-line">Authorized Signatory</div>
                  </div>
                )}
                
                {regularTemplate.showFooter && (
                  <div className="regular-footer">
                    {regularTemplate.footer || 'Thank you for your business.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {activePreview !== 'regular' && <div className="paper-edge-bottom"></div>}
        </div>
      </div>

      <style jsx>{`
        .preview-container {
          background: #0f172a;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 20px 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          color: white;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .preview-tabs {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px;
          border-radius: 12px;
          gap: 4px;
        }

        .preview-tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          padding: 10px;
          border-radius: 8px;
          color: #94a3b8;
          font-weight: 700;
          font-size: 11.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .preview-tab-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.02);
        }

        .preview-tab-btn.active {
          background: #f97316;
          color: white;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
        }

        .paper-viewport {
          display: flex;
          justify-content: center;
          max-height: 520px;
          overflow-y: auto;
          padding: 10px 4px;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.2);
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.2);
          transition: max-width 0.3s ease;
        }

        .paper-viewport.viewport-regular {
          max-height: 560px;
        }

        /* Customize Scrollbar for Paper Viewport */
        .paper-viewport::-webkit-scrollbar {
          width: 6px;
        }
        .paper-viewport::-webkit-scrollbar-track {
          background: transparent;
        }
        .paper-viewport::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 99px;
        }

        .paper-strip {
          background: #ffffff;
          color: #1e293b;
          width: 100%;
          max-width: 310px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
          font-family: 'Courier New', Courier, monospace;
          font-size: 13px;
          line-height: 1.4;
          position: relative;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          transition: all 0.3s ease;
        }

        .paper-strip.regular-page-strip {
          max-width: 100%;
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 11px;
          line-height: 1.4;
          padding: 24px;
          border-radius: 4px;
        }

        .paper-content {
          width: 100%;
        }

        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .font-small { font-size: 11px; }

        .receipt-divider {
          color: #64748b;
          text-align: center;
          margin: 6px 0;
          letter-spacing: 1px;
          user-select: none;
          font-weight: bold;
        }

        /* Logo image styling */
        .receipt-logo-container {
          display: flex;
          justify-content: center;
          margin-bottom: 12px;
        }
        .receipt-logo {
          max-width: 100px;
          max-height: 50px;
          object-fit: contain;
          filter: grayscale(100%) contrast(200%);
        }

        .restaurant-name {
          text-transform: uppercase;
          text-align: center;
          margin-bottom: 4px;
        }

        .restaurant-details {
          color: #475569;
          margin-bottom: 4px;
        }

        .license-info {
          margin-top: 2px;
        }

        .order-meta {
          color: #334155;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .highlight-line {
          font-weight: bold;
        }

        .customer-info {
          margin-top: 2px;
          font-style: italic;
        }

        .custom-header-text, .custom-footer-text {
          font-weight: bold;
        }

        /* Items table styling */
        .items-table, .kot-table-header {
          display: grid;
          font-weight: bold;
          color: #0f172a;
        }
        .items-table {
          grid-template-columns: 2fr 30px 55px 60px;
          gap: 4px;
        }
        .kot-table-header {
          grid-template-columns: 1fr 50px;
          gap: 8px;
        }

        .items-list, .kot-items-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .items-row {
          display: grid;
          align-items: start;
        }
        .items-list .items-row {
          grid-template-columns: 2fr 30px 55px 60px;
          gap: 4px;
        }
        .kot-items-list .items-row {
          grid-template-columns: 1fr 50px;
          gap: 8px;
        }

        .item-variant {
          display: block;
          font-size: 10px;
          color: #475569;
          margin-top: 1px;
        }

        .special-instructions {
          background: #f1f5f9;
          border-left: 3px solid #dc2626;
          padding: 6px 10px;
          margin: 10px 0;
          border-radius: 2px 4px 4px 2px;
        }
        .inst-label {
          font-weight: bold;
          color: #dc2626;
          margin-bottom: 2px;
        }
        .inst-content {
          color: #334155;
          font-style: italic;
        }

        .kot-table-label {
          font-weight: bold;
          margin: 6px 0;
        }

        .totals-summary {
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: #334155;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
        }

        .grand-total-row {
          display: flex;
          justify-content: space-between;
          font-size: 16px;
          font-weight: bold;
          color: #000000;
        }

        .bill-footer-msg {
          color: #475569;
          margin-top: 8px;
          white-space: pre-wrap;
        }

        .powered-by {
          color: #94a3b8;
          margin-top: 12px;
          font-size: 9.5px;
          letter-spacing: 0.5px;
        }

        /* ---------------------------------
         ESC/POS Font Styling Simulations
        ---------------------------------- */
        .font-normal {
          font-size: 13px;
        }

        .font-double {
          font-size: 17px;
          font-weight: bold;
          letter-spacing: 0.5px;
        }

        .font-double-height {
          font-size: 13px;
          font-weight: bold;
          display: inline-block;
          transform: scaleY(1.4);
          transform-origin: center top;
          margin-bottom: 4px;
        }

        .font-double-width {
          font-size: 13px;
          font-weight: bold;
          display: inline-block;
          transform: scaleX(1.3);
          transform-origin: center top;
        }

        /* ---------------------------------
         REGULAR A4 SIMULATED STYLING
        ---------------------------------- */
        .regular-view {
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: white;
          color: #1e293b;
        }
        
        .regular-header {
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 12px;
        }

        .regular-logo {
          max-width: 60px;
          max-height: 40px;
          object-fit: contain;
        }

        .regular-restaurant-info {
          flex: 1;
          text-align: left;
        }

        .regular-restaurant-name {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          text-transform: uppercase;
        }

        .regular-restaurant-sub {
          font-size: 10px;
          color: #64748b;
        }

        .regular-title {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 1px;
          text-align: center;
          color: #0f172a;
          margin: 4px 0;
        }

        .regular-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          font-size: 10px;
          text-align: left;
          background: #f8fafc;
          padding: 8px 12px;
          border-radius: 6px;
        }

        .regular-items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: 9.5px;
        }

        .regular-items-table th {
          background: #f1f5f9;
          font-weight: 700;
          color: #334155;
          padding: 6px 8px;
          border-bottom: 1px solid #cbd5e1;
          text-align: center;
        }

        .regular-items-table td {
          padding: 6px 8px;
          border-bottom: 1px solid #e2e8f0;
          text-align: center;
        }

        .regular-items-table th.text-left, .regular-items-table td.text-left {
          text-align: left;
        }

        .regular-items-table th.text-right, .regular-items-table td.text-right {
          text-align: right;
        }

        .regular-totals-section {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 16px;
          text-align: left;
          margin-top: 8px;
        }

        .regular-terms {
          font-size: 9px;
          color: #64748b;
          border: 1px solid #e2e8f0;
          padding: 8px;
          border-radius: 6px;
        }

        .terms-pre {
          white-space: pre-wrap;
          margin-top: 4px;
        }

        .regular-totals-right {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 10px;
        }

        .regular-total-row {
          display: flex;
          justify-content: space-between;
          color: #475569;
        }

        .regular-total-row.grand {
          font-size: 12px;
          font-weight: 800;
          color: #0f172a;
          border-top: 1.5px solid #cbd5e1;
          padding-top: 4px;
          margin-top: 2px;
        }

        .amount-words {
          font-size: 8px;
          font-style: italic;
          color: #64748b;
          text-align: right;
          margin-top: 2px;
        }

        .regular-signature {
          align-self: flex-end;
          margin-top: 20px;
          text-align: right;
          width: 150px;
        }

        .sig-line {
          border-top: 1px solid #cbd5e1;
          font-size: 9px;
          font-weight: 600;
          color: #475569;
          padding-top: 4px;
          margin-top: 20px;
          text-align: center;
        }

        .regular-footer {
          margin-top: 16px;
          border-top: 1px dashed #e2e8f0;
          padding-top: 8px;
          font-size: 9px;
          color: #64748b;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
