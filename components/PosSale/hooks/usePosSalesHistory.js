import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../services/posSaleApi';

/**
 * POS Sales History Hook (V2)
 * 
 * Uses the new /api/v1/pos/sale/history endpoint with Slice-based pagination
 * (no expensive COUNT(*) queries). Provides fast search and date filtering.
 */
export default function usePosSalesHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  
  const pageRef = useRef(0);
  const controllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const fetchHistory = useCallback(async (params = {}, resetPage = true) => {
    // Cancel any in-flight request
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    const currentPage = resetPage ? 0 : pageRef.current;
    if (resetPage) {
      pageRef.current = 0;
      setOrders([]);
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.fetchSalesHistory(
        { ...params, page: currentPage, size: params.size || 20 },
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      const items = result?.items || [];
      if (resetPage) {
        setOrders(items);
      } else {
        setOrders((prev) => [...prev, ...items]);
      }
      setHasMore(Boolean(result?.hasMore));
      pageRef.current = currentPage + 1;
    } catch (err) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
      console.error('Failed to fetch sales history', err);
      setError('Failed to load sales history. Please try again.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const searchHistoryDebounced = useCallback((params = {}, delayMs = 300) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchHistory(params, true);
    }, delayMs);
  }, [fetchHistory]);

  const loadMore = useCallback((params = {}) => {
    fetchHistory(params, false);
  }, [fetchHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return {
    orders,
    loading,
    hasMore,
    error,
    fetchHistory,
    searchHistoryDebounced,
    loadMore,
  };
}
