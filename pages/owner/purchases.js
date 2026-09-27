import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import PurchaseOrdersPage from './purchase-orders';

/**
 * Backward compatibility alias & redirect for /owner/purchases.
 * Forwards to /owner/purchase-orders while preserving any query parameters.
 */
export default function PurchasesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      router.replace(
        {
          pathname: '/owner/purchase-orders',
          query: router.query,
        },
        undefined,
        { shallow: true }
      );
    }
  }, [router.isReady, router.query]);

  return <PurchaseOrdersPage />;
}
