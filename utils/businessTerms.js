// Business-type specific wording for the kitchen (KOT) flow.
// Non-food business types keep the same send-to-KOT behaviour but speak in their own terms.
const AREA_BY_POS_TYPE = {
  carwash: 'Service Bay',
  salon: 'Service Station',
  grocery: 'Packing Desk',
  others: 'Order Desk',
};

// Car Wash: the unbilled mode is named Pay Later instead of the bay name.
const MODE_LABEL_BY_POS_TYPE = {
  carwash: 'Pay Later',
};

export function getKitchenTerms(posType) {
  const key = String(posType || '').trim().toLowerCase();
  const area = AREA_BY_POS_TYPE[key] || 'Kitchen';
  const modeLabel = MODE_LABEL_BY_POS_TYPE[key] || area;
  return {
    area,
    modeLabel,
    sendLabel: modeLabel === area ? `Send to ${area}` : `Save as ${modeLabel}`,
    sendTitle: modeLabel === area ? `Send KOT to ${area}` : `Save order to ${modeLabel}`,
  };
}
