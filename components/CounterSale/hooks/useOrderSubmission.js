import { useState, useEffect, useCallback, useRef } from 'react';
import Cookies from 'js-cookie';
import { createOrder } from '../services/counterSaleApi';
import { buildOrderPayload } from '../domain/orderPayload';
import { isKnownOffline } from '../../../utils/networkState';
import { allocateOfflineSequence, ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../../../utils/offlineSequences';
import { isAndroidPrintStationEnabled, localPrintWillHandleKind } from '../../../utils/cloudPrintStation';
import { isNativePrintServicePaired } from '../../../utils/printServiceClient';
import { businessTimeToUtc, getLocalISOString } from '../../../utils/timezoneUtils';
import { isKitchenModuleEnabled } from '../../../utils/moduleVisibility';
import api from '../../../utils/api';
import { generateInvoicePdfDoc } from '../../../utils/invoicePdf';

function createIdempotencyKey() {
  return typeof window !== 'undefined' && window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stableSerialize(value) {
  if (value === undefined) {
    return '"__undefined__"';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`;
}

export default function useOrderSubmission({ timezone, createOrderFn = createOrder }) {
  const [processing, setProcessing] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [orderDateTime, setOrderDateTime] = useState('');
  const [isDateTimeManuallyEdited, setIsDateTimeManuallyEdited] = useState(false);

  // Synchronous lock ref to prevent duplicate/concurrent request overlaps before React state updates
  const submittingRef = useRef(false);

  // Idempotency transaction state tracker
  const transactionRef = useRef({
    fingerprint: null,
    idempotencyKey: null,
    offlineNumbers: null,
    orderTimestamp: null
  });

  // Time ticker
  useEffect(() => {
    if (isDateTimeManuallyEdited) return;

    const updateTime = () => {
      setOrderDateTime(getLocalISOString(timezone));
    };

    updateTime();
    const interval = setInterval(updateTime, 5000);
    return () => clearInterval(interval);
  }, [timezone, isDateTimeManuallyEdited]);

  const handleSubmitOrder = useCallback(async ({
    paymentPayload = null,
    orgId,
    cart,
    setCart,
    orderNote,
    setOrderNote,
    totals,
    discountType,
    discountValue,
    customersEnabled,
    primaryCustomer,
    customerSelections,
    isCreditSale,
    selectedCreditCustomerId,
    selectedCreditCustomer,
    orderMode,
    kitchenEnabled,
    config,
    initialTable,
    onOrderCreated,
    onBack,
    rememberTrending,
    notify,
    showConfirm,
    clearCustomerSelection,
    confirmStockWarning = false
  }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setProcessing(true);

    try {
      const knownOffline = isKnownOffline();
      const mainOfflineDevice = isMainOfflineBillingDevice();
      const effectiveOrderMode = kitchenEnabled ? orderMode : 'settle';

      if (isCreditSale && knownOffline) {
        throw new Error('Credit orders are online-only in this release.');
      }
      if (isCreditSale && !selectedCreditCustomerId) {
        throw new Error('Choose a credit customer before completing a credit sale.');
      }

      const isCreditFinal = isCreditSale && effectiveOrderMode === 'settle';
      const isOfflineFinal = knownOffline && effectiveOrderMode === 'settle' && mainOfflineDevice;
      const isSettleDirect = effectiveOrderMode === 'settle' && paymentPayload !== null;

      const plannedPrintKind = effectiveOrderMode === 'kitchen'
        ? 'kot'
        : (isSettleDirect || isCreditFinal || isOfflineFinal ? 'bill' : 'settle');

      // Skip auto print check: if this terminal's local printers handle KOT and/or BILL,
      // instruct the backend to skip enqueuing background cloud print jobs to prevent duplicates.
      const skipAutoPrintKinds = [];
      if (!knownOffline) {
        if (localPrintWillHandleKind('kot')) skipAutoPrintKinds.push('KOT');
        if (localPrintWillHandleKind('bill')) skipAutoPrintKinds.push('BILL');
      }

      // 1. Build a business payload first to calculate the transaction fingerprint
      // We pass parsedDate: null if the date is not manually backdated, so that the auto-ticking time ticker
      // does not change the logical fingerprint identity on retries.
      let parsedDate = null;
      if (isDateTimeManuallyEdited && orderDateTime) {
        try {
          parsedDate = businessTimeToUtc(orderDateTime, timezone);
        } catch (err) {
          console.error('Failed to parse custom date time', err);
        }
      }

      const terminalId = Cookies.get('terminalId') || null;

      const fingerprintPayload = buildOrderPayload({
        orgId,
        config,
        cart,
        totals,
        discountType,
        discountValue,
        customersEnabled,
        primaryCustomer,
        customerSelections,
        isCreditSale,
        selectedCreditCustomerId,
        selectedCreditCustomer,
        orderMode,
        kitchenEnabled,
        paymentPayload,
        parsedDate: isDateTimeManuallyEdited ? parsedDate : null,
        initialTable,
        knownOffline,
        mainOfflineDevice,
        skipAutoPrintKinds,
        terminalId,
        orderNote
      });

      const fingerprint = stableSerialize(fingerprintPayload);

      // 2. Resolve transaction execution state
      if (
        !transactionRef.current.idempotencyKey ||
        transactionRef.current.fingerprint !== fingerprint
      ) {
        transactionRef.current = {
          fingerprint,
          idempotencyKey: createIdempotencyKey(),
          offlineNumbers: null,
          orderTimestamp: null
        };
      }

      const idempotencyKey = transactionRef.current.idempotencyKey;

      // 3. Freeze order timestamp if not manually edited, so retries use the identical request body
      if (!isDateTimeManuallyEdited && !transactionRef.current.orderTimestamp) {
        transactionRef.current.orderTimestamp = getLocalISOString(timezone);
      }

      const finalParsedDate = isDateTimeManuallyEdited
        ? parsedDate
        : businessTimeToUtc(transactionRef.current.orderTimestamp, timezone);

      // 4. Construct the final request payload (avoiding mutation)
      const payload = buildOrderPayload({
        orgId,
        config,
        cart,
        totals,
        discountType,
        discountValue,
        customersEnabled,
        primaryCustomer,
        customerSelections,
        isCreditSale,
        selectedCreditCustomerId,
        selectedCreditCustomer,
        orderMode,
        kitchenEnabled,
        paymentPayload,
        parsedDate: finalParsedDate,
        initialTable,
        knownOffline,
        mainOfflineDevice,
        skipAutoPrintKinds,
        terminalId,
        orderNote
      });

      let requestPayload = {
        ...payload,
        confirmStockWarning: Boolean(confirmStockWarning),
        sourceLocalRef: idempotencyKey
      };

      if (knownOffline && effectiveOrderMode === 'settle' && !mainOfflineDevice) {
        throw new Error('Final offline billing is available only on the main billing device. This device can create provisional kitchen orders while offline.');
      }

      // 5. Offline sequence lease allocations & retry stability preservation
      if (knownOffline && mainOfflineDevice) {
        await ensureOfflineSequenceLeases();

        if (!transactionRef.current.offlineNumbers) {
          transactionRef.current.offlineNumbers = {
            orderNo: allocateOfflineSequence('SALE_ORDER'),
            invoiceNo: effectiveOrderMode === 'settle' ? allocateOfflineSequence('CUSTOMER_INVOICE') : null,
            paymentNo: effectiveOrderMode === 'settle' ? allocateOfflineSequence('INBOUND_PAYMENT') : null
          };
        }

        const offlineNumbers = transactionRef.current.offlineNumbers;
        
        requestPayload = {
          ...requestPayload,
          syncOrigin: 'MAIN_OFFLINE',
          orderNo: offlineNumbers.orderNo,
          ...(effectiveOrderMode === 'settle'
            ? {
                offlineInvoiceNo: offlineNumbers.invoiceNo,
                offlinePaymentNo: offlineNumbers.paymentNo
              }
            : {})
        };
      }

      if (effectiveOrderMode === 'settle' && !knownOffline) {
        const phone = paymentPayload?.customerPhone || primaryCustomer?.phone || selectedCreditCustomer?.phone || customerSelections?.[0]?.phone;
        if (phone) {
          try {
            const effectiveOrderForPdf = {
              ...requestPayload,
              customerPhone: phone,
              customerName: paymentPayload?.customerName || primaryCustomer?.name || selectedCreditCustomer?.name || customerSelections?.[0]?.name,
              customerId: paymentPayload?.customerId || primaryCustomer?.id || selectedCreditCustomer?.id || customerSelections?.[0]?.id,
              customers: [{
                id: paymentPayload?.customerId || primaryCustomer?.id || selectedCreditCustomer?.id || customerSelections?.[0]?.id,
                name: paymentPayload?.customerName || primaryCustomer?.name || selectedCreditCustomer?.name || customerSelections?.[0]?.name,
                phone: phone,
                primary: true
              }],
              orgId: orgId || config?.orgId || config?.branchId,
              clientId: config?.clientId,
              lines: requestPayload.lines || [],
              grandTotal: requestPayload.grandTotal || totals?.total_inc_tax,
              paymentMethod: paymentPayload?.paymentMethod || requestPayload.paymentMethod
            };
            const generated = await generateInvoicePdfDoc(effectiveOrderForPdf, config);
            if (generated?.pdfBase64) {
              requestPayload.pdfBase64 = generated.pdfBase64;
            }
          } catch (pdfErr) {
            console.warn('[useOrderSubmission] Could not pre-generate PDF attachment for WhatsApp:', pdfErr);
          }
        }
      }

      const res = await createOrderFn(requestPayload, {
        headers: { 'Idempotency-Key': idempotencyKey },
        skipOfflineQueue: knownOffline && effectiveOrderMode === 'settle' && !mainOfflineDevice
      });

      if (!res?.success) {
        throw new Error(
          res?.message ||
          res?.data?.message ||
          'Order creation failed.'
        );
      }

      // Reset transaction token on successful backend registration
      transactionRef.current = {
        fingerprint: null,
        idempotencyKey: null,
        offlineNumbers: null,
        orderTimestamp: null
      };

      // Surface negative stock or non-stock sales policy warnings only if not already confirmed in modal
      if (!confirmStockWarning) {
        const orderWarnings = res?.warnings || res?.data?.warnings || res?.data?.data?.warnings || [];
        if (Array.isArray(orderWarnings) && orderWarnings.length > 0) {
          orderWarnings.forEach((warn) => {
            if (typeof notify === 'function') {
              notify('warning', `⚠️ Stock Warning: ${warn}`);
            }
          });
        } else if (res?.message && String(res.message).startsWith('Warning:')) {
          if (typeof notify === 'function') {
            notify('warning', `⚠️ ${res.message}`);
          }
        }
      }

      const offlineAccepted = Boolean(res.offline || res.data?.offline);
      const savedOrder = res.data || {};
      const savedLines = Array.isArray(savedOrder?.lines) && savedOrder.lines.length
        ? savedOrder.lines
        : requestPayload.lines;
      const fallbackId = savedOrder?.id || savedOrder?.offlineOperationId || `offline-${Date.now()}`;
      
      const printOrder = {
        ...requestPayload,
        ...savedOrder,
        id: fallbackId,
        orderNo: savedOrder?.orderNo || requestPayload.orderNo || `OFFLINE-${String(fallbackId).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`,
        invoiceNo: savedOrder?.invoiceNo,
        paymentNo: savedOrder?.paymentNo,
        createdAt: savedOrder?.createdAt || new Date().toISOString(),
        updatedAt: savedOrder?.updatedAt || new Date().toISOString(),
        lines: savedLines,
        items: requestPayload.lines,
        pricesIncludeTax: config?.pricesIncludeTax,
        offline: offlineAccepted,
        offlineOperationId: savedOrder?.offlineOperationId,
        syncStatus: offlineAccepted ? 'QUEUED' : savedOrder?.syncStatus,
      };

      const kind = plannedPrintKind;
      setShowSettleDialog(false);
      
      if (typeof onOrderCreated === 'function') {
        onOrderCreated(printOrder, kind);
      }
      setIsDateTimeManuallyEdited(false);
      
      if (typeof rememberTrending === 'function') {
        rememberTrending(cart);
      }

      // Automatically dispatch official invoice PDF via WhatsApp if settled with customer phone (fallback if not pre-attached)
      const customerPhone = primaryCustomer?.phone || selectedCreditCustomer?.phone || customerSelections?.[0]?.phone || savedOrder?.customerPhone;
      if (effectiveOrderMode === 'settle' && savedOrder?.id && customerPhone && !knownOffline && !requestPayload.pdfBase64) {
        (async () => {
          try {
            const generated = await generateInvoicePdfDoc(printOrder, config);
            if (generated?.pdfBase64) {
              await api.post('/api/v1/whatsapp/send-order-bill', {
                orderId: savedOrder.id,
                phone: String(customerPhone).trim(),
                pdfBase64: generated.pdfBase64
              });
            }
          } catch (pdfErr) {
            console.warn('[useOrderSubmission] Failed to dispatch WhatsApp invoice PDF:', pdfErr);
          }
        })();
      }

      // Always clear cart, order notes, and customer selection after successful order creation
      setCart([]);
      if (typeof setOrderNote === 'function') setOrderNote('');
      if (typeof clearCustomerSelection === 'function') clearCustomerSelection();

      const isKitchenOn = isKitchenModuleEnabled(config);
      if (kind !== 'settle' && (config?.tableManagementEnabled || isKitchenOn)) {
        if (onBack) onBack();
      }
    } catch (err) {
      const isStockWarning = err.response?.status === 409 ||
        (err.response?.data?.message && String(err.response.data.message).startsWith('STOCK_WARNING:')) ||
        (err.message && String(err.message).startsWith('STOCK_WARNING:')) ||
        (Array.isArray(err.response?.data?.warnings) && err.response.data.warnings.length > 0);

      if (isStockWarning && typeof showConfirm === 'function') {
        const rawWarnings = err.response?.data?.warnings || [];
        let warningLines = rawWarnings;
        if (warningLines.length === 0) {
          const rawMsg = err.response?.data?.message || err.message || '';
          warningLines = rawMsg.replace('STOCK_WARNING:', '').split(';').map(s => s.trim()).filter(Boolean);
        }
        const formattedMsg = warningLines.map(w => `• ${w}`).join('\n');
        submittingRef.current = false;
        setProcessing(false);
        showConfirm({
          title: '⚠️ Stock Shortage Warning',
          message: `${formattedMsg || 'One or more items have insufficient stock.'}\n\nDo you want to continue with the sale anyway?`,
          onConfirm: () => {
            handleSubmitOrder({
              paymentPayload,
              orgId,
              cart,
              setCart,
              orderNote,
              setOrderNote,
              totals,
              discountType,
              discountValue,
              customersEnabled,
              primaryCustomer,
              customerSelections,
              isCreditSale,
              selectedCreditCustomerId,
              selectedCreditCustomer,
              orderMode,
              kitchenEnabled,
              config,
              initialTable,
              onOrderCreated,
              onBack,
              rememberTrending,
              notify,
              showConfirm,
              clearCustomerSelection,
              confirmStockWarning: true
            });
          },
          onCancel: () => {
            if (typeof notify === 'function') {
              notify('info', 'Sale cancelled. You can modify the items.');
            }
          },
          type: 'warning'
        });
        return;
      }

      if (err?.code === 'OFFLINE_CACHE_MISS') {
        notify('warning', 'Offline POS data is not prepared on this device yet. Open POS once while online before using it offline.');
      } else {
        notify('error', 'Failed to place order: ' + (err.response?.data?.message || err.message));
      }
    } finally {
      submittingRef.current = false;
      setProcessing(false);
    }
  }, [orderDateTime, timezone]);

  return {
    processing,
    showSettleDialog,
    setShowSettleDialog,
    orderDateTime,
    setOrderDateTime,
    isDateTimeManuallyEdited,
    setIsDateTimeManuallyEdited,
    handleSubmitOrder
  };
}
