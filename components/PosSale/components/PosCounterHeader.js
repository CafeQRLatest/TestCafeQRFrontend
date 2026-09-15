import React, { useState } from 'react';
import styled from 'styled-components';
import { FaArrowLeft, FaHistory, FaMinus, FaPlus } from 'react-icons/fa';
import PosSalesHistoryModal from './PosSalesHistoryModal';
import PosDateTimePicker from './PosDateTimePicker';

const HeaderContainer = styled.header`
  padding: 8px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: 54px;
  box-sizing: border-box;

  @media (max-width: 768px) {
    padding: 6px 14px;
    gap: 10px;
    flex-wrap: wrap;
  }
`;

const HeaderLeftGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-shrink: 0;

  @media (max-width: 540px) {
    gap: 8px;
    flex-wrap: wrap;
  }
`;

const BackBtn = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #475569;
  transition: all 0.15s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
  }
`;

const TitleGroup = styled.div`
  display: flex;
  align-items: center;
  border-left: 4px solid #f97316;
  padding-left: 10px;
  height: 24px;
`;

const HeaderTitle = styled.h1`
  margin: 0;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
`;

const ModeSwitch = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 3px;
  height: 34px;
  box-sizing: border-box;
  margin-left: 4px;

  @media (max-width: 540px) {
    margin-left: 0;
  }
`;

const ModeBtn = styled.button`
  border: none;
  border-radius: 7px;
  padding: 0 13px;
  height: 26px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;

  ${props => props.$variant === 'kitchen' && (props.$active ? `
    background: #f97316;
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(249, 115, 22, 0.3);
  ` : `
    background: transparent;
    color: #64748b;
    &:hover { color: #0f172a; background: #e2e8f0; }
  `)}

  ${props => props.$variant === 'settle' && (props.$active ? `
    background: #16a34a;
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(22, 163, 74, 0.3);
  ` : `
    background: transparent;
    color: #64748b;
    &:hover { color: #0f172a; background: #e2e8f0; }
  `)}
`;


const HeaderDateTimeWrapper = styled.div`
  display: flex;
  align-items: center;
  min-width: 210px;
  max-width: 265px;
  flex: 0 1 auto;

  @media (max-width: 900px) {
    min-width: 175px;
    max-width: 210px;
  }

  @media (max-width: 580px) {
    width: 100%;
    max-width: 100%;
    flex: 1 1 100%;
    order: 10;
    margin-top: 4px;
  }
`;

const ZoomControl = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 3px;
  border-radius: 9px;
  height: 34px;
  box-sizing: border-box;
  flex-shrink: 0;

  @media (max-width: 820px) {
    display: none;
  }
`;

const ZoomBtn = styled.button`
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-weight: 800;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    border-color: #f97316;
    background: #fff7ed;
    color: #ea580c;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const ZoomLabel = styled.span`
  font-size: 11px;
  font-weight: 800;
  color: #475569;
  padding: 0 4px;
  min-width: 32px;
  text-align: center;
`;

const SalesHistoryBtn = styled.button`
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  background: #f97316;
  color: #ffffff;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(249, 115, 22, 0.25);
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  &:hover {
    background: #ea580c;
    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.35);
  }

  @media (max-width: 680px) {
    padding: 0;
    width: 34px;
    justify-content: center;
    .btn-text { display: none; }
  }
`;

export default function PosCounterHeader({
  onBack,
  initialTable,
  catalog,
  order,
  ui,
  router,
  onPrintOrder
}) {
  const { 
    mode: orderMode, setMode: setOrderMode, activeOrderMode, 
    kitchenEnabled, hideKitchenForTakeaway, hideKitchenForDineIn,
    orderDateTime, setOrderDateTime, isDateTimeManuallyEdited, setIsDateTimeManuallyEdited
  } = order;
  const { zoomLevel, handleZoom, THEME: theme } = ui;
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const isTakeaway = initialTable && (initialTable.tableNumber === 'COUNTER' && initialTable.orderType !== 'DINE_IN');
  const isDelivery = initialTable && (initialTable.tableNumber === 'COUNTER' && initialTable.orderType === 'DELIVERY');
  const isDineIn = !isTakeaway && !isDelivery;
  const hideKitchen = (isTakeaway && hideKitchenForTakeaway) || (isDineIn && hideKitchenForDineIn);
  const showKitchenToggle = kitchenEnabled && !hideKitchen;

  const tableNameText = initialTable
    ? (initialTable.tableNumber === 'COUNTER'
      ? (isDelivery ? 'Delivery Order' : (isDineIn ? 'Dine In' : 'Takeaway Order'))
      : `Table ${initialTable.tableNumber}`)
    : 'Sale Order (V2)';

  return (
    <>
      <HeaderContainer>
        {/* 1. Back Button & Table Name */}
        <HeaderLeftGroup>
          {kitchenEnabled && (
            <BackBtn onClick={onBack} aria-label="Go back" title="Back">
              <FaArrowLeft size={12} />
            </BackBtn>
          )}

          <TitleGroup>
            <HeaderTitle>{tableNameText}</HeaderTitle>
          </TitleGroup>
        </HeaderLeftGroup>

        {/* 2. Kitchen | Settle Mode Switch */}
        {showKitchenToggle && (
          <ModeSwitch>
            <ModeBtn
              $active={activeOrderMode === 'kitchen'}
              $variant="kitchen"
              onClick={() => setOrderMode('kitchen')}
              title="Send KOT to Kitchen"
            >
              Kitchen
            </ModeBtn>
            <ModeBtn
              $active={activeOrderMode === 'settle'}
              $variant="settle"
              onClick={() => setOrderMode('settle')}
              title="Settle Bill Instantly"
            >
              Settle
            </ModeBtn>
          </ModeSwitch>
        )}

        {/* 3. Time Filter / Date & Time */}
        <HeaderDateTimeWrapper onClick={e => e.stopPropagation()}>
          <PosDateTimePicker 
            value={orderDateTime}
            onChange={(val, meta) => {
              setOrderDateTime(val);
              if (meta?.isNow) {
                setIsDateTimeManuallyEdited(false);
              } else if (!meta?.liveTick) {
                setIsDateTimeManuallyEdited(true);
              }
            }}
            isLive={!isDateTimeManuallyEdited}
            onResetLive={() => {
              setIsDateTimeManuallyEdited(false);
            }}
            themeColor="#f97316"
          />
        </HeaderDateTimeWrapper>

        {/* 4. Zoom Control */}
        <ZoomControl onClick={e => e.stopPropagation()}>
          <ZoomBtn
            type="button"
            onClick={() => handleZoom(-0.1)}
            disabled={zoomLevel <= 0.8}
            title="Zoom Out"
          >
            <FaMinus size={8} />
          </ZoomBtn>
          <ZoomLabel>{Math.round(zoomLevel * 100)}%</ZoomLabel>
          <ZoomBtn
            type="button"
            onClick={() => handleZoom(0.1)}
            disabled={zoomLevel >= 1.4}
            title="Zoom In"
          >
            <FaPlus size={8} />
          </ZoomBtn>
        </ZoomControl>
      </HeaderContainer>

      <PosSalesHistoryModal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        currencySym={ui.sym}
        onPrint={onPrintOrder}
      />
    </>
  );
}
