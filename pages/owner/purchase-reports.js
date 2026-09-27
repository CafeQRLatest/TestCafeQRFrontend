import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PurchaseReportsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const query = { ...router.query, section: 'purchases' };
    router.replace({
      pathname: '/owner/reports',
      query
    });
  }, [router, router.isReady]);

  return null;
}
