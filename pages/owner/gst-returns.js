import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function GSTReturnsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/owner/tax-reports');
  }, [router]);

  return null;
}
