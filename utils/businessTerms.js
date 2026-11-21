// Business-type specific wording for the kitchen (KOT) flow.
// Non-food business types keep the same send-to-KOT behaviour but call the unbilled mode "Pay Later".
const NON_FOOD_POS_TYPES = ['carwash', 'salon', 'grocery', 'boutique', 'others'];

export function isNonFoodType(posType) {
  return NON_FOOD_POS_TYPES.includes(String(posType || '').trim().toLowerCase());
}

// Non-food businesses don't do "takeaway" — the counter order type is just an "Order".
export function getTakeawayLabel(posType) {
  return isNonFoodType(posType) ? 'Order' : 'Takeaway';
}

// Veg / Non-Veg filter and indicators only make sense for food businesses.
export function showsDietInfo(posType) {
  return !isNonFoodType(posType);
}

// Wording and placeholders for the Product Management popup.
// Food businesses keep the cafe/restaurant wording; non-food types get retail wording.
const RETAIL_NAME_EXAMPLES = {
  grocery: 'e.g. Basmati Rice 5kg',
  boutique: 'e.g. Cotton Kurta - Blue / M',
  carwash: 'e.g. Full Body Wash',
  salon: 'e.g. Haircut & Styling',
  others: 'e.g. Cotton T-Shirt - Black / L',
};

export function getProductFormTerms(posType) {
  if (!isNonFoodType(posType)) {
    return {
      isRetail: false,
      namePlaceholder: 'e.g. Chicken Burger',
      codeLabel: 'Item Code',
      codePlaceholder: 'e.g. CB001',
      descriptionPlaceholder: 'Describe product details, ingredients, or preparation notes...',
      rawMaterialLabel: 'Is Ingredient',
      recipeTitle: 'Recipe / Bill of Materials',
      addComponentLabel: 'Add Ingredient',
      componentSearchPlaceholder: 'Search ingredient to add...',
      upsellsTab: 'Upsells',
      upsellsTitle: 'Upsells & Add-ons',
      upsellLinkLabel: 'Link Product (Upsell)',
      taxCodePlaceholder: 'e.g. 2106',
    };
  }
  const key = String(posType || '').trim().toLowerCase();
  return {
    isRetail: true,
    namePlaceholder: RETAIL_NAME_EXAMPLES[key] || RETAIL_NAME_EXAMPLES.others,
    codeLabel: 'SKU / Item Code',
    codePlaceholder: 'e.g. SKU-1001',
    descriptionPlaceholder: 'Describe the product: brand, size, colour, material, warranty...',
    rawMaterialLabel: 'Raw Material / Component',
    recipeTitle: 'Bill of Materials',
    addComponentLabel: 'Add Component',
    componentSearchPlaceholder: 'Search component to add...',
    upsellsTab: 'Cross-sell',
    upsellsTitle: 'Cross-sell & Add-ons',
    upsellLinkLabel: 'Link Product (Cross-sell)',
    taxCodePlaceholder: 'Enter tax / commodity code',
  };
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
