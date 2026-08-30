import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { FaShoppingBag } from 'react-icons/fa';
import useCounterSaleController from './hooks/useCounterSaleController';
import CounterHeader from './components/CounterHeader';
import ProductCatalog from './components/ProductCatalog';
import CartSidebar from './components/CartSidebar';
import DiscountDialog from './components/DiscountDialog';
import VariablePriceModal from './components/VariablePriceModal';
import useBarcodeScanner from './hooks/useBarcodeScanner';
import CameraBarcodeScannerModal from './components/CameraBarcodeScannerModal';
import * as S from './CounterSale.styles';

// Import sub-modals from parent directory
import VariantSelector from '../VariantSelector';
import CreditCustomerQuickCreateModal from '../CreditCustomerQuickCreateModal';
import ProductManagementPopup from '../ProductManagementPopup';
import PaymentDialog from '../PaymentDialog';

export default function CounterSaleContainer(props) {
  const router = useRouter();
  const state = useCounterSaleController(props);

  const {
    bootstrap,
    catalog,
    cart,
    customer,
    discounts,
    order,
    ui
  } = state;

  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  const handleUnknownBarcode = React.useCallback((scannedCode) => {
    if (ui.notify) ui.notify('info', `Unrecognized barcode (${scannedCode}). Enter product details to save.`);
    bootstrap.startNewProductForPopup({ barcode: scannedCode });
  }, [bootstrap, ui]);

  useBarcodeScanner({
    products: bootstrap.products,
    addToCart: cart.addToCart,
    notify: ui.notify,
    search: catalog.search,
    setSearch: catalog.setSearch,
    onUnknownBarcode: handleUnknownBarcode,
    isEnabled: !order.showSettleDialog && !ui.selectedProductForPopup
  });

  if (bootstrap.loading) return null;

  return (
    <S.CsModalOverlay onClick={props.onBack} $zoom={ui.zoomLevel}>
      <S.CsModalContent onClick={e => e.stopPropagation()}>
        <CounterHeader
          onBack={props.onBack}
          initialTable={props.initialTable}
          catalog={catalog}
          order={order}
          ui={ui}
          router={router}
        />

        <S.CsMainLayout>
          {bootstrap.loadError ? (
            <S.CsOfflineNotice>{bootstrap.loadError}</S.CsOfflineNotice>
          ) : (
            <>
              {catalog.productListingOn ? (
                <>
                  <S.CsCatalogSection>
                    <ProductCatalog
                      bootstrap={bootstrap}
                      catalog={catalog}
                      cart={cart}
                      ui={ui}
                      order={order}
                      onOpenCameraScanner={() => setShowCameraScanner(true)}
                    />
                  </S.CsCatalogSection>
                  <CartSidebar
                    bootstrap={bootstrap}
                    catalog={catalog}
                    cart={cart}
                    customer={customer}
                    discounts={discounts}
                    order={order}
                    ui={ui}
                    mobileCartOpen={mobileCartOpen}
                    setMobileCartOpen={setMobileCartOpen}
                  />
                  {cart.items.length > 0 && (
                    <S.CsMobileCartToggle
                      type="button"
                      $themeColor={ui.THEME.main}
                      onClick={() => setMobileCartOpen(true)}
                    >
                      <FaShoppingBag /> View Cart <span>|</span> {cart.cartCountLabel} <span>|</span> {ui.sym}{Number(cart.totals.total_amount || 0).toFixed(bootstrap.config?.currencyDecimalPlaces ?? 2)}
                    </S.CsMobileCartToggle>
                  )}
                </>
              ) : (
                <S.CsCatalogSection>
                  <ProductCatalog
                    bootstrap={bootstrap}
                    catalog={catalog}
                    cart={cart}
                    ui={ui}
                    order={order}
                    onOpenCameraScanner={() => setShowCameraScanner(true)}
                  />
                  <CartSidebar
                    bootstrap={bootstrap}
                    catalog={catalog}
                    cart={cart}
                    customer={customer}
                    discounts={discounts}
                    order={order}
                    ui={ui}
                    mobileCartOpen={mobileCartOpen}
                    setMobileCartOpen={setMobileCartOpen}
                  />
                </S.CsCatalogSection>
              )}
            </>
          )}
        </S.CsMainLayout>

        <CreditCustomerQuickCreateModal
          open={customer.showNewCreditCustomer}
          themeColor="#14b8a6"
          onClose={() => customer.setShowNewCreditCustomer(false)}
          onCreated={customer.handleCreditCustomerCreated}
        />
        
        {cart.variantLoading && <S.CsOfflineNotice style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 1200 }}>Loading item options...</S.CsOfflineNotice>}
        
        {cart.variantProduct && (
          <VariantSelector
            product={cart.variantProduct}
            onClose={() => cart.setVariantProduct(null)}
            onSelect={cart.addVariantToCart}
            quantityMode
            initialQuantities={cart.currentVariantQuantities}
            onSelectMany={cart.syncVariantCart}
            themeColor={ui.THEME.main}
            themeSoftColor={ui.THEME.soft}
            themeDarkColor={ui.THEME.dark}
          />
        )}

        {cart.variablePriceProduct && (
          <VariablePriceModal
            product={cart.variablePriceProduct}
            onClose={() => cart.setVariablePriceProduct(null)}
            onConfirm={cart.addVariablePriceToCart}
            sym={ui.sym}
            themeColor={ui.THEME.main}
            currencyDecimalPlaces={bootstrap.config?.currencyDecimalPlaces ?? 2}
          />
        )}

        <DiscountDialog
          discounts={discounts}
          cart={cart}
          ui={ui}
          bootstrap={bootstrap}
        />

        {ui.selectedProductForPopup && (
          <ProductManagementPopup
            product={ui.selectedProductForPopup}
            viewOnly={ui.popupViewOnly}
            onClose={() => { ui.setSelectedProductForPopup(null); ui.setPopupViewOnly(false); }}
            onSaveSuccess={bootstrap.refreshProductsList}
            config={bootstrap.config}
          />
        )}

        {order.showSettleDialog && (
          <PaymentDialog
            order={{
              lines: cart.items.map((item) => ({
                productId: item.productId || item.id,
                productName: item.displayName || item.name || 'Item',
                unitPrice: item.price,
                quantity: item.qty,
                taxRate: (item.taxRate !== undefined && item.taxRate !== null && item.taxRate !== '') ? Number(item.taxRate) : null,
                isPackagedGood: item.isPackagedGood === true || item.is_packaged_good === true,
                discountAmount: item.discount_amount || 0,
                discountPercent: item.discount_percent || 0,
                discount: item.discount,
              })),
              orderDiscount: discounts.discountsEnabled ? { type: discounts.type, value: discounts.value } : { type: 'amount', value: 0 },
              grandTotal: cart.totals.total_inc_tax,
              totalTaxAmount: cart.totals.total_tax,
              totalDiscountAmount: cart.totals.discount_amount,
              totalAmount: cart.totals.total_inc_tax,
              customerId: customer.selectedCustomerId || customer.selectedCreditCustomer?.linkedCustomerId || customer.selectedCustomers?.[0]?.id || null,
              customerName: customer.customerName || customer.selectedCustomers?.[0]?.name || null,
              customerPhone: customer.customerPhone || customer.selectedCustomers?.[0]?.phone || null,
              loyaltyPoints: customer.selectedCustomer?.loyaltyPoints ?? customer.selectedCustomer?.loyalty_points ?? customer.selectedCustomers?.[0]?.loyaltyPoints ?? null,
              customer: customer.selectedCustomer || null,
              customers: customer.selectedCustomers || [],
              orderNo: '(new)',
              tableNumber: props.initialTable?.tableNumber || 'Counter',
            }}
            customer={customer}
            allCustomers={bootstrap.allCustomers || []}
            loading={order.processing}
            config={bootstrap.config}
            creditCustomers={customer.creditCustomers || []}
            onClose={() => order.setShowSettleDialog(false)}
            onConfirm={(paymentPayload) => {
              order.setShowSettleDialog(false);
              order.handlePlaceOrder(paymentPayload);
            }}
            onCreditCustomerCreated={props.onCreditCustomerCreated}
            themeColor="green"
            disableEditDiscount={true}
          />
        )}

        {showCameraScanner && (
          <CameraBarcodeScannerModal
            open={showCameraScanner}
            onClose={() => setShowCameraScanner(false)}
            products={bootstrap.products}
            addToCart={cart.addToCart}
            notify={ui.notify}
            onUnknownBarcode={handleUnknownBarcode}
            themeColor={ui.THEME.main}
          />
        )}
      </S.CsModalContent>
    </S.CsModalOverlay>
  );
}
