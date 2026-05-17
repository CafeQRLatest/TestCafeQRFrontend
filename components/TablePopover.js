import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  FaEdit,
  FaExchangeAlt,
  FaFire,
  FaPrint,
  FaReceipt,
  FaTimes,
  FaTrash,
  FaUtensils,
  FaWallet,
  FaCog,
} from 'react-icons/fa';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(10px);

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

const Card = styled.div`
  width: min(456px, 100%);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  background: white;
  border-radius: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  padding: 24px;

  @media (max-width: 640px) {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: 24px 24px 0 0;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
`;

const Title = styled.div`
  min-width: 0;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: clamp(22px, 6vw, 26px);
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  span {
    display: inline-flex;
    margin-top: 10px;
    color: #64748b;
    font-size: 13px;
    font-weight: 800;
  }
`;

const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 20px;
  padding: 4px;
`;

const StatusRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 999px;
  background: ${props => props.$bg || '#f1f5f9'};
  color: ${props => props.$color || '#475569'};
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
`;

const Divider = styled.div`
  height: 1px;
  background: #e2e8f0;
  margin: 22px 0;
`;

const InfoStack = styled.div`
  display: grid;
  gap: 12px;
`;

const InfoLine = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  color: #475569;
  font-size: 14px;
  font-weight: 700;

  strong {
    color: #0f172a;
    font-weight: 900;
    text-align: right;
    overflow-wrap: anywhere;
  }

  @media (max-width: 420px) {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;

    strong {
      text-align: left;
    }
  }
`;

const LinkButton = styled.button`
  border: 0;
  background: transparent;
  color: #059669;
  font-size: 12px;
  font-weight: 900;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
`;

const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 380px) {
    grid-template-columns: 1fr;
  }
`;

const ActionButton = styled.button`
  border: 0;
  border-radius: 16px;
  min-height: 54px;
  padding: 12px 14px;
  background: ${props => props.$bg || '#f8fafc'};
  color: ${props => props.$color || '#0f172a'};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.04em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  text-transform: uppercase;
  min-width: 0;
  overflow-wrap: anywhere;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const WideButton = styled(ActionButton)`
  grid-column: 1 / -1;
`;

const MoveBox = styled.div`
  margin-top: 12px;
  display: grid;
  gap: 10px;
`;

const Select = styled.select`
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: white;
  color: #0f172a;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 800;
`;

const BlockedNotice = styled.div`
  grid-column: 1 / -1;
  border: 1px solid #fed7aa;
  border-radius: 14px;
  background: #fff7ed;
  color: #c2410c;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.4;
`;

function statusPalette(status) {
  const normalized = String(status || 'AVAILABLE').toUpperCase();
  if (normalized === 'OCCUPIED' || normalized === 'KITCHEN' || normalized === 'CONFIRMED' || normalized === 'DRAFT') {
    return { label: 'OCCUPIED', bg: '#fee2e2', color: '#dc2626' };
  }
  if (normalized === 'BILLED') return { label: 'BILLED', bg: '#dcfce7', color: '#059669' };
  if (normalized === 'RESERVED') return { label: 'RESERVED', bg: '#dbeafe', color: '#2563eb' };
  if (normalized === 'CLEANING') return { label: 'CLEANING', bg: '#fef3c7', color: '#d97706' };
  if (normalized === 'MAINTENANCE') return { label: 'HOLD', bg: '#e2e8f0', color: '#475569' };
  return { label: 'AVAILABLE', bg: '#f8fafc', color: '#64748b' };
}

export default function TablePopover({
  table,
  order,
  availableTables = [],
  canStartOrder = true,
  blockedMessage = '',
  busy = false,
  onClose,
  onStartOrder,
  onBill,
  onKot,
  onEdit,
  onCancel,
  onPay,
  onMove,
  onEditTable,
}) {
  const [showMove, setShowMove] = useState(false);
  const [targetTableId, setTargetTableId] = useState('');
  const status = useMemo(() => statusPalette(order?.orderStatus || order?.order_status || table?.status), [order, table]);
  const hasOrder = Boolean(order);

  if (!table) return null;

  const orderRef = order?.orderNo || order?.order_no || (order?.id ? `#${String(order.id).slice(0, 8)}` : '-');

  return (
    <Overlay onMouseDown={onClose}>
      <Card onMouseDown={(event) => event.stopPropagation()}>
        <Header>
          <Title>
            <h2>Table {table.tableNumber}</h2>
            <span>{table.seatingCapacity || 0} Seats{table.section ? ` - ${table.section}` : ''}</span>
          </Title>
          <CloseButton type="button" onClick={onClose} aria-label="Close table actions">
            <FaTimes />
          </CloseButton>
        </Header>

        <StatusRow>
          <Badge $bg={status.bg} $color={status.color}>{status.label}</Badge>
          {hasOrder && <Badge $bg="#f1f5f9" $color="#475569">{order.fulfillmentType || order.fulfillment_type || 'DINE_IN'}</Badge>}
        </StatusRow>

        <Divider />

        {hasOrder ? (
          <>
            <InfoStack>
              <InfoLine>
                <span><FaUtensils /> Order</span>
                <strong>{orderRef}</strong>
              </InfoLine>
              <InfoLine>
                <span>Total</span>
                <strong>₹{Number(order.grandTotal ?? order.grand_total ?? 0).toFixed(2)}</strong>
              </InfoLine>
              <InfoLine>
                <span>Table transfer</span>
                <LinkButton type="button" onClick={() => setShowMove(value => !value)}>
                  <FaExchangeAlt /> Change Table
                </LinkButton>
              </InfoLine>
            </InfoStack>

            {showMove && (
              <MoveBox>
                <Select value={targetTableId} onChange={(event) => setTargetTableId(event.target.value)}>
                  <option value="">Select available table</option>
                  {availableTables.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      Table {candidate.tableNumber} ({candidate.seatingCapacity || 0} seats)
                    </option>
                  ))}
                </Select>
                <ActionButton
                  type="button"
                  $bg="#ecfdf5"
                  $color="#047857"
                  disabled={!targetTableId || busy}
                  onClick={() => onMove?.(targetTableId)}
                >
                  <FaExchangeAlt /> Move Order
                </ActionButton>
              </MoveBox>
            )}

            <Divider />

            <ActionGrid>
              <ActionButton type="button" $bg="#f0f9ff" $color="#0369a1" disabled={busy} onClick={() => onBill?.(order)}>
                <FaPrint /> Bill
              </ActionButton>
              <ActionButton type="button" $bg="#fff7ed" $color="#ea580c" disabled={busy} onClick={() => onKot?.(order)}>
                <FaFire /> KOT
              </ActionButton>
              <ActionButton type="button" $bg="#ecfdf5" $color="#047857" disabled={busy} onClick={() => onEdit?.(order)}>
                <FaEdit /> Edit
              </ActionButton>
              <ActionButton type="button" $bg="#fef2f2" $color="#b91c1c" disabled={busy} onClick={() => onCancel?.(order)}>
                <FaTrash /> Cancel
              </ActionButton>
              <WideButton type="button" $bg="#fff1f2" $color="#be123c" disabled={busy} onClick={() => onPay?.(order)}>
                <FaWallet /> Pay & Finish
              </WideButton>
              <WideButton type="button" $bg="#f97316" $color="white" disabled={busy} onClick={() => onEditTable?.(table)}>
                <FaCog /> Edit Table Settings
              </WideButton>
            </ActionGrid>
          </>
        ) : (
          <ActionGrid>
            {!canStartOrder && (
              <BlockedNotice>
                {blockedMessage || `Table is currently ${status.label}. Change it to Available before placing an order.`}
              </BlockedNotice>
            )}
            <WideButton
              type="button"
              $bg="#f97316"
              $color="white"
              disabled={busy || !canStartOrder}
              onClick={() => canStartOrder && onStartOrder?.(table)}
            >
              <FaReceipt /> Start Order
            </WideButton>
            <WideButton type="button" $bg="#f8fafc" $color="#475569" disabled={busy} onClick={() => onEditTable?.(table)}>
              <FaCog /> Edit Table Settings
            </WideButton>
          </ActionGrid>
        )}
      </Card>
    </Overlay>
  );
}
