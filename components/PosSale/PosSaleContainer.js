import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { FaShoppingBag } from 'react-icons/fa';
import usePosSaleController from './hooks/usePosSaleController';
import PosCounterHeader from './components/PosCounterHeader';
import PosProductCatalog from './components/PosProductCatalog';
import PosCartSidebar from './components/PosCartSidebar';
import DiscountDialog from '../CounterSale/components/DiscountDialog';
import VariablePriceModal from '../CounterSale/components/VariablePriceModal';
import useBarcodeScanner from '../CounterSale/hooks/useBarcodeScanner';
import CameraBarcodeScannerModal from '../CounterSale/components/CameraBarcodeScannerModal';
import * as S from '../CounterSale/CounterSale.styles';
import { isLoyaltyModuleEnabled } from '../../utils/moduleVisibility';

// Sub-modals from parent components directory
import VariantSelector from '../VariantSelector';
import CreditCustomerQuickCreateModal from '../CreditCustomerQuickCreateModal';
import ProductManagementPopup from '../ProductManagementPopup';
import PaymentDialog from '../PaymentDialog';

export default function PosSaleContainer(props) {
  const router = useRouter();
  const state = usePosSaleController(props);

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
    isEnabled: bootstrap.config?.barcodeScannerEnabled === true && !order.showSettleDialog && !ui.selectedProductForPopup
  });

  if (bootstrap.loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100%',
        background: '#f8fafc',
        color: '#64748b',
        fontSize: '1rem',
        gap: '12px'
      }}>
        <div style={{
          width: '24px',
          height: '24px',
          border: '3px solid #e2e8f0',
          borderTopColor: '#0ea5e9',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <span>Initializing POS Sales Engine (V2)...</span>
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <S.CsModalOverlay onClick={props.onBack} $zoom={ui.zoomLevel}>
      <S.CsModalContent onClick={e => e.stopPropagation()}>
        <PosCounterHeader
          onBack={props.onBack}
          initialTable={props.initialTable}
          catalog={catalog}
          order={order}
          ui={ui}
          router={router}
          onPrintOrder={props.onPrintOrder}
        />

        <S.CsMainLayout>
          {bootstrap.loadError ? (
            <div style={{
              margin: '20px auto',
              padding: '12px 20px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '14px',
              fontWeight: 500,
              textAlign: 'center'
            }}>
              {bootstrap.loadError}
            </div>
          ) : (
            <>
              {catalog.productListingOn ? (
                <>
                  <S.CsCatalogSection>
                    <PosProductCatalog
                      bootstrap={bootstrap}
                      catalog={catalog}
                      cart={cart}
                      ui={ui}
                      order={order}
                      onOpenCameraScanner={() => setShowCameraScanner(true)}
                    />
                  </S.CsCatalogSection>
                  <PosCartSidebar
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
                  {mobileCartOpen && (
                    <S.CsMobileCartBackdrop onClick={() => setMobileCartOpen(false)} />
                  )}
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#ffffff', width: '100%' }}>
                  <PosProductCatalog
                    bootstrap={bootstrap}
                    catalog={catalog}
                    cart={cart}
                    ui={ui}
                    order={order}
                    onOpenCameraScanner={() => setShowCameraScanner(true)}
                  />
                  <PosCartSidebar
                    bootstrap={bootstrap}
                    catalog={catalog}
                    cart={cart}
                    customer={customer}
                    discounts={discounts}
                    order={order}
                    ui={ui}
                    isCounterMode={true}
                    mobileCartOpen={false}
                    setMobileCartOpen={setMobileCartOpen}
                  />
                </div>
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
        
        {cart.variantLoading && (
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1200,
            padding: '12px 24px',
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            color: '#475569',
            fontSize: '13px',
            fontWeight: 600
          }}>
            Loading item options...
          </div>
        )}
        
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
            themeColor="green"
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
              loyaltyPoints: (isLoyaltyModuleEnabled(bootstrap.config) || bootstrap.config?.loyaltyEnabled === true)
                ? (customer.selectedCustomer?.loyaltyPoints ?? customer.selectedCustomer?.loyalty_points ?? customer.selectedCustomers?.[0]?.loyaltyPoints ?? null)
                : null,
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
            allowCustomerSelection={true}
            onClose={() => order.setShowSettleDialog(false)}
            onConfirm={(paymentPayload) => {
              order.setShowSettleDialog(false);
              order.handlePlaceOrder(paymentPayload);
            }}
            onCreditCustomerCreated={props.onCreditCustomerCreated}
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
