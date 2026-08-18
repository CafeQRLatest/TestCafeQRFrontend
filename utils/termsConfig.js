/**
 * Centralized Terms & Conditions Version Configuration.
 * 
 * When major terms or policy changes are deployed, bump this version (e.g. 'v1.1').
 * All users with a missing or older version will be prompted to accept before continuing.
 */
export const CURRENT_TERMS_VERSION = 'v1.0';

export const TERMS_SUMMARY_POINTS = [
  {
    title: 'Hardware Resale & Warranty Notice',
    desc: 'CafeQR LLP acts as a reseller of hardware (including Bluetooth printers). All hardware warranties, service, and replacements are provided solely by the original manufacturer (SHREYANS / Hoin) or authorized distributors. CafeQR disclaims direct hardware warranty liability.'
  },
  {
    title: 'Software Licensing & Subscriptions',
    desc: 'Software core plans and add-on sachets (KOT, Inventory ERP, CRM, Credit Ledger) are annual licenses. Software fees are non-refundable once activated.'
  },
  {
    title: 'Hardware Return Policy',
    desc: 'Physical hardware may be returned within 7 days of delivery only if the unit remains unopened in original factory condition. Return shipping is handled by the customer.'
  },
  {
    title: 'Limitation of Liability',
    desc: 'CafeQR LLP total liability for hardware purchases is capped at the purchase price paid. CafeQR is not liable for incidental business losses resulting from third-party hardware malfunction.'
  }
];
