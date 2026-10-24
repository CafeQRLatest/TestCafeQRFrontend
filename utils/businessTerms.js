// Business-type specific wording for the kitchen (KOT) flow.
// Non-food business types keep the same send-to-KOT behaviour but call the unbilled mode "Pay Later".
const NON_FOOD_POS_TYPES = ['carwash', 'salon', 'grocery', 'others'];

export function isNonFoodType(posType) {
  return NON_FOOD_POS_TYPES.includes(String(posType || '').trim().toLowerCase());
}

export function getKitchenTerms(posType) {
  if (isNonFoodType(posType)) {
    return {
      area: 'Pay Later',
      modeLabel: 'Pay Later',
      sendLabel: 'Save as Pay Later',
      sendTitle: 'Save order to Pay Later',
    };
  }
  return {
    area: 'Kitchen',
    modeLabel: 'Kitchen',
    sendLabel: 'Send to Kitchen',
    sendTitle: 'Send KOT to Kitchen',
  };
}
