import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FaTimes, FaSearch, FaReceipt, FaSpinner, FaChevronRight, FaCalendarAlt, FaPrint } from 'react-icons/fa';
import usePosSalesHistory from '../hooks/usePosSalesHistory';
import { useAuth } from '../../../context/AuthContext';
import { formatTzDate } from '../../../utils/timezoneUtils';

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;

  @media (max-width: 640px) {
    padding: 0;
  }
`;

const ModalPanel = styled.div`
  background: white;
  width: 100%;
  max-width: 860px;
  height: 85vh;
  max-height: 720px;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeIn 0.15s ease-out;

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  @media (max-width: 640px) {
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
`;

const ModalHeader = styled.div`
  padding: 18px 24px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;

  @media (max-width: 640px) {
    padding: 12px 16px;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 640px) {
    font-size: 1.05rem;
  }
`;

const CloseBtn = styled.button`
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    background: #e2e8f0;
    color: #0f172a;
  }
`;

const SearchToolbar = styled.div`
  padding: 14px 24px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    padding: 10px 14px;
  }
`;

const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
  min-width: 200px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 14px 10px 38px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #1e293b;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
`;

const TableContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;

  th {
    position: sticky;
    top: 0;
    background: #f8fafc;
    padding: 12px 16px;
    font-weight: 600;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
    z-index: 1;

    @media (max-width: 640px) {
      padding: 10px 10px;
      font-size: 0.8rem;
    }
  }

  td {
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;

    @media (max-width: 640px) {
      padding: 10px 10px;
      font-size: 0.8rem;
    }
  }

  .col-optional {
    @media (max-width: 640px) {
      display: none;
    }
  }

  .mobile-only-date {
    display: none;
    @media (max-width: 640px) {
      display: block;
    }
  }

  tbody tr:hover {
    background: #f8fafc;
  }
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props => props.$status === 'COMPLETED' ? '#dcfce7' : '#fef9c3'};
  color: ${props => props.$status === 'COMPLETED' ? '#15803d' : '#a16207'};
`;

const EmptyNotice = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: #64748b;
  font-size: 0.95rem;
`;

const LoadMoreBtn = styled.button`
  width: 100%;
  padding: 12px;
  background: #f8fafc;
  border: none;
  border-top: 1px solid #e2e8f0;
  color: #0ea5e9;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;

  &:hover {
    background: #f1f5f9;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export default function PosSalesHistoryModal({ open, onClose, currencySym = '₹', onPrint }) {
  const { timezone } = useAuth();
  const { orders, loading, hasMore, fetchHistory, searchHistoryDebounced, loadMore } = usePosSalesHistory();
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch initial history once when modal opens
  useEffect(() => {
    if (open) {
      setSearchTerm('');
      fetchHistory({ search: '' });
    }
  }, [open, fetchHistory]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    searchHistoryDebounced({ search: val });
  };

  if (!open) return null;

  return (
    <ModalBackdrop onClick={onClose}>
      <ModalPanel onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <Title>
            <FaReceipt style={{ color: '#0ea5e9' }} />
            Sales History (Fast V2 Projection)
          </Title>
          <CloseBtn onClick={onClose} aria-label="Close">
            <FaTimes size={16} />
          </CloseBtn>
        </ModalHeader>

        <SearchToolbar>
          <SearchInputWrapper>
            <SearchIcon>
              <FaSearch size={13} />
            </SearchIcon>
            <SearchInput
              type="text"
              placeholder="Search by order #, customer name, phone..."
              value={searchTerm}
              onChange={handleSearchChange}
              autoFocus
            />
          </SearchInputWrapper>
        </SearchToolbar>

        <TableContainer>
          {orders.length === 0 && !loading ? (
            <EmptyNotice>No sales records found.</EmptyNotice>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th className="col-optional">Date & Time</th>
                  <th>Customer</th>
                  <th className="col-optional">Type</th>
                  <th className="col-optional">Payment</th>
                  <th className="col-optional">Items</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                  {onPrint && <th style={{ textAlign: 'center', width: '90px' }}>Print</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((ord) => (
                  <tr key={ord.orderId}>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                      {ord.orderNo}
                      <div className="mobile-only-date" style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 400 }}>
                        {ord.orderDate ? formatTzDate(ord.orderDate, timezone, { format: 'time' }) : ''}
                      </div>
                    </td>
                    <td className="col-optional" style={{ color: '#64748b', fontSize: '0.8rem' }}>
                      {ord.orderDate ? formatTzDate(ord.orderDate, timezone, { format: 'datetime' }) : '—'}
                    </td>
                    <td>
                      {ord.customerName || 'Walk-in'}
                      {ord.customerPhone && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{ord.customerPhone}</div>
                      )}
                    </td>
                    <td className="col-optional" style={{ fontSize: '0.8rem', color: '#64748b' }}>{ord.orderType || 'Counter'}</td>
                    <td className="col-optional">{ord.paymentMethod || 'Cash'}</td>
                    <td className="col-optional">{ord.itemCount || 1}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                      {currencySym}{Number(ord.grandTotal || 0).toFixed(2)}
                    </td>
                    <td>
                      <StatusBadge $status={ord.status}>{ord.status}</StatusBadge>
                    </td>
                    {onPrint && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => onPrint({ id: ord.orderId, orderNo: ord.orderNo }, 'bill')}
                            title="Print Bill"
                            style={{
                              background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px',
                              padding: '4px 8px', cursor: 'pointer', fontSize: '0.7rem', color: '#0ea5e9',
                              display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'
                            }}
                          >
                            <FaPrint size={10} /> Bill
                          </button>
                          <button
                            type="button"
                            onClick={() => onPrint({ id: ord.orderId, orderNo: ord.orderNo }, 'kot')}
                            title="Print KOT"
                            style={{
                              background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px',
                              padding: '4px 8px', cursor: 'pointer', fontSize: '0.7rem', color: '#f97316',
                              display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'
                            }}
                          >
                            <FaPrint size={10} /> KOT
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#0ea5e9' }}>
              <FaSpinner className="fa-spin" size={24} />
            </div>
          )}
        </TableContainer>

        {hasMore && !loading && (
          <LoadMoreBtn type="button" onClick={() => loadMore({ search: searchTerm })}>
            Load More Transactions <FaChevronRight size={12} />
          </LoadMoreBtn>
        )}
      </ModalPanel>
    </ModalBackdrop>
  );
}
