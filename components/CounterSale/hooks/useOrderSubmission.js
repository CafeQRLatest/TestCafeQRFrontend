import { useState, useEffect, useCallback, useRef } from 'react';
import Cookies from 'js-cookie';
import { createOrder } from '../services/counterSaleApi';
import { buildOrderPayload } from '../domain/orderPayload';
import { isKnownOffline } from '../../../utils/networkState';
import { allocateOfflineSequence, ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../../../utils/offlineSequences';
import { isAndroidPrintStationEnabled } from '../../../utils/cloudPrintStation';
import { isNativePrintServicePaired } from '../../../utils/printServiceClient';
import { businessTimeToUtc, getLocalISOString } from '../../../utils/timezoneUtils';

function localPrintWillHandleOrder(kind) {
  if (typeof window === 'undefined') return false;
  if (!['kot', 'bill'].includes(kind)) return false;
  return (
    isAndroidPrintStationEnabled() ||
    isNativePrintServicePaired() ||
    window.localStorage.getItem('PRINTER_MODE') === 'winspool'
  );
}

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

export default function useOrderSubmission({ timezone }) {
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
    notify
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

      // Skip auto print check
      const skipAutoPrintKinds = !knownOffline && localPrintWillHandleOrder(plannedPrintKind)
        ? [plannedPrintKind === 'kot' ? 'KOT' : 'BILL']
        : [];

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

      const res = await createOrder(requestPayload, {
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

      if (kind !== 'settle') {
        setCart([]);
        if (typeof setOrderNote === 'function') setOrderNote('');
        if (config?.tableManagementEnabled) {
          if (onBack) onBack();
        }
      }
    } catch (err) {
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
