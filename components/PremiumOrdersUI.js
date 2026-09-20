import styled, { keyframes } from 'styled-components';

export const slideIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const OrdersWrap = styled.div`
  padding: 16px 0 32px;
  animation: ${slideIn} 0.3s ease-out;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  position: relative;
  min-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
`;

export const OrdersHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px 16px;
  border-bottom: 1px solid #e2e8f0;
  position: relative;

  @media (max-width: 900px) {
    padding: 0 16px 12px;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
  }
`;

export const SegmentedWrapper = styled.div`
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  box-shadow: inset 0 2px 4px rgba(15, 23, 42, 0.05);

  @media (max-width: 900px) {
    width: 100%;
    justify-content: space-between;
  }
`;

export const SegmentBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  background: ${props => props.$active ? 'white' : 'transparent'};
  color: ${props => props.$active ? props.$accent : '#64748b'};
  box-shadow: ${props => props.$active ? '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -1px rgba(15, 23, 42, 0.03)' : 'none'};
  transition: all 0.2s ease-in-out;

  &:hover {
    color: ${props => props.$active ? props.$accent : '#0f172a'};
  }

  span.badge {
    background: ${props => props.$active ? props.$accent + '15' : '#e2e8f0'};
    color: ${props => props.$active ? props.$accent : '#64748b'};
    padding: 1px 6px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 800;
  }

  @media (max-width: 600px) {
    padding: 6px 10px;
    font-size: 11px;
    gap: 4px;
    span.badge { font-size: 9px; padding: 1px 4px; }
  }
`;

export const SliderViewport = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const SliderTrack = styled.div`
  display: flex;
  gap: 24px;
  overflow-x: auto;
  padding: 24px;
  scroll-behavior: smooth;
  flex: 1;
  align-items: flex-start;
  
  &::-webkit-scrollbar {
    height: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 9999px;
  }

  @media (max-width: 600px) {
    gap: 16px;
    padding: 16px;
  }
`;

export const SliderArrow = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  background: white;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s;

  &:hover {
    background: #f8fafc;
    color: #3b82f6;
    border-color: #94a3b8;
    transform: translateY(-50%) scale(1.08);
  }

  &:disabled {
    opacity: 0;
    cursor: not-allowed;
    pointer-events: none;
  }

  @media (max-width: 900px) {
    display: none;
  }
`;

export const LeftArrow = styled(SliderArrow)`
  left: 16px;
`;

export const RightArrow = styled(SliderArrow)`
  right: 16px;
`;

export const TableCubePanel = styled.div`
  width: 100%;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

export const TableCubeLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  padding: 2px 0;

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .swatch {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
`;

export const TableCubeGrid = styled.div`
  display: flex;
  align-content: flex-start;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;

  @media (max-width: 600px) {
    padding: 16px;
    gap: 10px;
  }
`;

export const TableOrderCube = styled.div`
  width: 56px;
  height: 56px;
  border: 1px solid ${props => props.$bg || '#94a3b8'};
  border-radius: 12px;
  background: ${props => props.$bg || '#94a3b8'};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  position: relative;
  overflow: hidden;

  &:hover {
    transform: scale(1.12);
    box-shadow: 0 0 0 3px ${props => props.$ring || 'rgba(148, 163, 184, 0.35)'}, 0 4px 12px ${props => props.$shadow || 'rgba(15, 23, 42, 0.16)'};
  }

  .table-no {
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    max-width: 52px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: white;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }

  @media (max-width: 600px) {
    width: 56px;
    height: 56px;
    border-radius: 12px;
  }
`;

export const ErrorCard = styled.div`
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  padding: 12px 16px;
  border-radius: 12px;
  margin: 16px 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #94a3b8;
  padding: 64px 32px;
  text-align: center;
  gap: 12px;

  svg {
    font-size: 48px;
    color: #cbd5e1;
  }

  strong {
    font-size: 16px;
    color: #64748b;
  }

  span {
    font-size: 13px;
    max-width: 320px;
  }
`;

export const HistoryShell = styled.section`
  padding: 0 24px 48px;
  display: flex;
  flex-direction: column;
  flex: 1;
  @media (max-width: 720px) { padding: 0 12px 48px; }
`;

export const HistoryToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-top: 3px solid #f97316;
  border-radius: 12px;
  padding: 6px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  @media (max-width: 720px) { flex-direction: column; align-items: stretch; padding: 10px; }
`;

export const HistFilterWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;

  .hist-dates {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    .premium-dt-picker { width: 200px !important; }
  }
  .h-filter-sep { font-size: 11px; font-weight: 800; color: #cbd5e1; margin: 0 2px; }
  .nice-select, .nice-select-wrapper { flex-shrink: 0; min-width: 110px !important; max-width: 130px !important; }
  .dt-trigger, .nice-select-trigger {
    border: 1.5px solid #e2e8f0 !important; border-radius: 12px !important;
    background: #f8fafc !important; height: 30px !important; font-size: 11px !important;
    padding: 0 10px !important; display: flex !important; align-items: center !important;
  }
  .dt-trigger:hover, .nice-select-trigger:hover { border-color: #f97316 !important; background: #fff7ed !important; }
  .nice-select-trigger span { font-size: 11px !important; font-weight: 700 !important; color: #1e293b !important; }
  @media (max-width: 720px) { 
    flex-direction: column; 
    align-items: stretch; 
    gap: 8px;
    
    .hist-dates { 
      width: 100%; 
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
      .premium-dt-picker { width: 100% !important; } 
    }
    
    .h-filter-sep {
      text-align: center;
      margin: 2px 0;
      font-size: 10px;
    }
    
    .nice-select, .nice-select-wrapper { width: 100% !important; max-width: none !important; }
  }
`;

export const HistSearchBox = styled.div`
  position: relative; flex: 1; min-width: 180px;
  svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
  input {
    width: 100%; height: 34px; padding-left: 30px; border: 1.5px solid #e2e8f0;
    border-radius: 12px; font-size: 12px; font-weight: 600; color: #1e293b;
    background: white; outline: none; box-sizing: border-box;
    &:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.08); }
  }
`;

export const HistTableWrap = styled.div`
  width: 100%; background: #fff; border-radius: 20px; border: 1px solid #f1f5f9;
  overflow-x: auto; box-shadow: 0 4px 24px rgba(0,0,0,0.04); margin-top: 8px; margin-bottom: 16px;
`;

export const HistTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 1060px;
  text-align: left;
  font-family: inherit;

  thead {
    background: #ffffff;
  }

  th {
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #ea580c;
    white-space: nowrap;
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid #f1f5f9;
    color: #475569;
    font-size: 13px;
    vertical-align: middle;
    white-space: nowrap;
  }
`;

export const HistRow = styled.tr`
  transition: all 0.15s ease; border-left: 3px solid transparent;
  &:hover { border-left-color: #f97316; td { background: #fffbf5; } }
`;

export const HistOrderLink = styled.code`
  font-family: monospace; font-size: 12px; font-weight: 800; color: #f97316;
  text-decoration: underline; cursor: pointer; background: transparent !important;
  padding: 0 !important; border: none !important;
`;

export const HistRowDate = styled.div`
  display: flex; flex-direction: column; gap: 2px;
  .rd-d { font-size: 11px; font-weight: 700; color: #1e293b; }
  .rd-t { font-size: 9px; font-weight: 500; color: #94a3b8; }
`;

export const HistItemsPill = styled.span`
  background: #f1f5f9; color: #64748b; padding: 3px 8px;
  border-radius: 6px; font-size: 11px; font-weight: 800;
`;

export const HistStatusBadge = styled.span`
  display: inline-flex; align-items: center; padding: 4px 10px;
  border-radius: 9999px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.02em; border: 1px solid;
`;

export const HistActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
`;

export const HistActionBtn = styled.button`
  border: none;
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: all 0.2s ease;
  white-space: nowrap;
  color: ${props => props.$tone === 'orange' ? '#ea580c' : props.$tone === 'red' ? '#b91c1c' : props.$tone === 'green' ? '#15803d' : '#475569'};
  background: ${props => props.$tone === 'orange' ? '#fff7ed' : props.$tone === 'red' ? '#fef2f2' : props.$tone === 'green' ? '#f0fdf4' : '#f8fafc'};

  &:hover {
    background: ${props => props.$tone === 'orange' ? '#ffedd5' : props.$tone === 'red' ? '#fee2e2' : props.$tone === 'green' ? '#dcfce7' : '#f1f5f9'};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export const HistPager = styled.div`
  display: flex; align-items: center; justify-content: center;
  gap: 12px; margin-top: 12px; color: #475569; font-size: 12px; font-weight: 900;
`;

export const HistPagerBtn = styled.button`
  height: 30px; border-radius: 12px; border: none;
  background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 800;
  cursor: pointer; padding: 0 16px; transition: all 0.25s;
  &:hover { background: #f97316; color: white; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export const AlertToggleBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid ${props => props.$active ? props.$color : '#cbd5e1'};
  background: ${props => props.$active ? props.$color + '10' : 'white'};
  color: ${props => props.$active ? props.$color : '#64748b'};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:hover {
    border-color: ${props => props.$color};
    color: ${props => props.$color};
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
  }

  &:active {
    transform: translateY(0);
  }
`;

export const OrdersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  padding: 16px;
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 12px;
  }
`;

export const TokenGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 24px;
  align-content: flex-start;
  align-items: flex-start;
`;

export const TokenCube = styled.div`
  width: 76px;
  height: 76px;
  border: 1px solid ${props => props.$bg || '#94a3b8'};
  border-radius: 14px;
  background: ${props => props.$bg || '#94a3b8'};
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 6px;
  box-sizing: border-box;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 3px ${props => props.$ring || 'rgba(148, 163, 184, 0.35)'}, 0 6px 16px ${props => props.$shadow || 'rgba(15, 23, 42, 0.16)'};
  }

  .token-no {
    font-size: 13px;
    font-weight: 900;
    line-height: 1.1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }

  .token-name {
    font-size: 9px;
    font-weight: 700;
    margin-top: 4px;
    opacity: 0.9;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.15);
  }
`;

export const KotCard = styled.div`
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03), 0 1px 2px rgba(15, 23, 42, 0.01);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  overflow: visible;
  position: relative;
  border: 1px solid rgba(226, 232, 240, 0.7);

  &:hover {
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.02);
    transform: translateY(-4px);
  }
`;

export const CardHeader = styled.div`
  padding: 10px 14px;
  background: ${props => {
    if (props.$type === 'takeaway') return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
    if (props.$type === 'delivery') return 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
    return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  }};
  color: white;
  border-top-left-radius: 13px;
  border-top-right-radius: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;

  &::after, &::before {
    content: '';
    position: absolute;
    bottom: -8px;
    width: 16px;
    height: 16px;
    background: #f8fafc;
    border-radius: 50%;
    z-index: 2;
  }
  &::before { left: -8px; }
  &::after { right: -8px; }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
      font-size: 13.5px;
      font-weight: 900;
      letter-spacing: -0.01em;
      color: white;
    }

    span.type {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      font-weight: 800;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding: 1px 6px;
      border-radius: 99px;
      width: fit-content;
    }
  }

  .time-group {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;

    span.time {
      font-size: 10.5px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.85);
    }

    span.elapsed {
      font-size: 8px;
      font-weight: 800;
      color: ${props => props.$isLate ? '#ef4444' : '#64748b'};
      background: ${props => props.$isLate ? '#fef2f2' : '#f1f5f9'};
      padding: 1px 6px;
      border-radius: 99px;
      display: flex;
      align-items: center;
      gap: 2px;
    }

    span.status-pill {
      font-size: 8.5px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 99px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: white;
      background: rgba(255, 255, 255, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.35);
    }
  }
`;

export const TicketDivider = styled.div`
  height: 0;
  border-bottom: 1.5px dashed #edf2f7;
  position: relative;
  z-index: 1;
  background: white;
  margin: 0;
`;

export const CustomerBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 6px 12px;
  font-size: 11px;
  
  .cust-header {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    color: #1e293b;
    
    svg {
      color: #64748b;
      font-size: 11px;
    }
  }

  .cust-phone {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #64748b;
    font-size: 10px;
    font-weight: 600;

    svg {
      color: #94a3b8;
      font-size: 10px;
    }
  }

  .cust-address {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    color: #64748b;
    font-size: 10px;
    font-weight: 600;
    margin-top: 1px;
    line-height: 1.35;

    svg {
      color: #94a3b8;
      font-size: 10px;
      margin-top: 1px;
      flex-shrink: 0;
    }
  }
`;

export const CardBody = styled.div`
  padding: 10px 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;

  .item-row {
    display: flex;
    align-items: center;
    font-size: 12.5px;
    font-weight: 700;
    color: #1e293b;
    line-height: 1.4;
    padding: 5px 0;
    border-bottom: 1px dashed #edf2f7;
    transition: all 0.15s;
    cursor: pointer;
    user-select: none;

    &:last-child {
      border-bottom: none;
    }

    &.checked {
      opacity: 0.45;
      text-decoration: line-through;
      
      span.qty {
        background: #f1f5f9;
        color: #94a3b8;
        border-color: #cbd5e1;
      }
    }

    &:hover:not(.checked) {
      padding-left: 3px;
      color: #3b82f6;
    }

    span.qty {
      background: #eff6ff;
      color: #2563eb;
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 800;
      margin-right: 8px;
      flex-shrink: 0;
      min-width: 24px;
      text-align: center;
      letter-spacing: 0.02em;
      border: 1px solid #dbeafe;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    span.checkbox {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13px;
      height: 13px;
      border: 1.5px solid #cbd5e1;
      border-radius: 3px;
      margin-right: 6px;
      flex-shrink: 0;
      transition: all 0.15s;
      
      svg {
        font-size: 8px;
        color: white;
        display: none;
      }
    }

    &.checked span.checkbox {
      background: #22c55e;
      border-color: #22c55e;
      svg {
        display: block;
      }
    }

    span.name {
      flex: 1;
    }
  }
`;

export const CardFooter = styled.div`
  padding: 8px 12px;
  background: linear-gradient(135deg, #f8fafc, #f0f4ff);
  border-top: 1px solid #edf2f7;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;

  .price {
    font-size: 16px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.02em;
    display: flex;
    align-items: baseline;
    gap: 1px;
  }

  .actions {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
`;

export const ActionBtn = styled.button`
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 800;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: 'Outfit', sans-serif;
  border: none;
  outline: none;

  background: ${props => {
    if (props.$variant === 'success') return 'linear-gradient(135deg, #10b981, #059669)';
    if (props.$variant === 'danger') return 'linear-gradient(135deg, #ef4444, #dc2626)';
    if (props.$variant === 'warning') return 'linear-gradient(135deg, #f59e0b, #d97706)';
    if (props.$variant === 'info') return 'linear-gradient(135deg, #06b6d4, #0891b2)';
    return '#ffffff';
  }};

  color: ${props => {
    if (props.$variant && props.$variant !== 'secondary') return '#ffffff';
    return '#334155';
  }};

  border: ${props => {
    if (props.$variant && props.$variant !== 'secondary') return 'none';
    return '1px solid #e2e8f0';
  }};

  box-shadow: ${props => {
    if (props.$variant === 'success') return '0 2px 8px rgba(16, 185, 129, 0.15)';
    if (props.$variant === 'danger') return '0 2px 8px rgba(239, 68, 68, 0.15)';
    if (props.$variant === 'warning') return '0 2px 8px rgba(245, 158, 11, 0.15)';
    if (props.$variant === 'info') return '0 2px 8px rgba(6, 182, 212, 0.15)';
    return '0 1px 3px rgba(15, 23, 42, 0.02)';
  }};

  &:hover {
    transform: translateY(-1.5px);
    background: ${props => {
      if (props.$variant === 'success') return 'linear-gradient(135deg, #059669, #047857)';
      if (props.$variant === 'danger') return 'linear-gradient(135deg, #dc2626, #b91c1c)';
      if (props.$variant === 'warning') return 'linear-gradient(135deg, #d97706, #b45309)';
      if (props.$variant === 'info') return 'linear-gradient(135deg, #0891b2, #0369a1)';
      return '#f8fafc';
    }};
    border-color: ${props => {
      if (props.$variant && props.$variant !== 'secondary') return 'none';
      return '#cbd5e1';
    }};
    box-shadow: ${props => {
      if (props.$variant === 'success') return '0 4px 12px rgba(16, 185, 129, 0.25)';
      if (props.$variant === 'danger') return '0 4px 12px rgba(239, 68, 68, 0.25)';
      if (props.$variant === 'warning') return '0 4px 12px rgba(245, 158, 11, 0.25)';
      if (props.$variant === 'info') return '0 4px 12px rgba(6, 182, 212, 0.25)';
      return '0 2px 6px rgba(15, 23, 42, 0.05)';
    }};
  }

  &:active {
    transform: scale(0.96) translateY(0);
    box-shadow: ${props => {
      if (props.$variant === 'success') return '0 2px 8px rgba(16, 185, 129, 0.2)';
      if (props.$variant === 'danger') return '0 2px 8px rgba(239, 68, 68, 0.2)';
      if (props.$variant === 'warning') return '0 2px 8px rgba(245, 158, 11, 0.2)';
      if (props.$variant === 'info') return '0 2px 8px rgba(6, 182, 212, 0.2)';
      return '0 1px 3px rgba(15, 23, 42, 0.05)';
    }};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));

  @media (max-width: 600px) {
    align-items: flex-end;
    padding: 0;
  }
`;

export const ModalContent = styled.div`
  background: white;
  padding: 24px;
  border-radius: 16px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
  }

  p {
    color: #334155;
  }

  textarea {
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    font-family: inherit;
    font-size: 13px;
    resize: none;
    box-sizing: border-box;
    color: #0f172a;
    background-color: #ffffff;

    &:focus {
      outline: none;
      border-color: #3b82f6;
    }
  }
`;

export const DeliveryDetailsCard = styled.div`
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 1px solid #bae6fd;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  margin-top: 4px;
  box-shadow: 0 2px 6px rgba(2, 132, 199, 0.05);

  .section-title {
    font-size: 11px;
    font-weight: 800;
    color: #0369a1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #bae6fd;
    padding-bottom: 4px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .detail-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 11.5px;
    color: #0c4a6e;
    line-height: 1.35;

    svg {
      margin-top: 2px;
      color: #0284c7;
      flex-shrink: 0;
      font-size: 12px;
    }
    
    strong {
      color: #0369a1;
    }
  }
`;

export const OrderDetailsModal = styled(ModalContent)`
  background: white;
  width: 95%;
  max-width: 350px;
  border-radius: 16px;
  border-top: 5px solid ${props => props.$accent || '#f97316'};
  box-shadow: 0 15px 30px -10px rgba(15, 23, 42, 0.15), 0 5px 10px -5px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  margin: 0 auto;
  max-height: 85vh;
  font-family: 'Outfit', 'Inter', sans-serif;
  
  .detail-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #ffffff;
    color: #0f172a;
    border-bottom: 1px solid #f1f5f9;
  }

  .detail-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .detail-title h3 {
    margin: 0;
    color: #0f172a;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .detail-sub {
    color: #f97316;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .detail-status-chip {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 6px;
    background: ${props => props.$accent || '#f97316'}15;
    color: ${props => props.$accent || '#f97316'};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    margin-top: 2px;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: #f1f5f9;
    color: #64748b;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      background: #e2e8f0;
      color: #0f172a;
      transform: rotate(90deg);
    }
  }

  .detail-body {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: white;
    flex: 1;
    overflow-y: auto;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 8px 10px;
    border-radius: 10px;
  }

  .meta-box {
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-items: center;
    text-align: center;
    border-right: 1px solid #e2e8f0;
    &:last-child {
      border-right: none;
    }
  }

  .meta-box span {
    color: #64748b;
    font-size: 8px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .meta-box strong {
    color: #0f172a;
    font-size: 11px;
    font-weight: 700;
  }

  .detail-items {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 0;
    max-height: 140px;
    overflow-y: auto;
    padding-right: 4px;

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
  }

  .detail-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
    
    &:last-child {
      border-bottom: none;
    }
  }

  .detail-item .qty {
    background: #e0f2fe;
    color: #0284c7;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 700;
    min-width: 20px;
    text-align: center;
  }

  .line-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .detail-item .name {
    color: #1e293b;
    font-size: 12px;
    font-weight: 600;
  }

  .line-meta {
    color: #64748b;
    font-size: 9px;
    font-weight: 500;
    
    .discount {
      color: #10b981;
      font-weight: 600;
    }
    
    .tax {
      color: #475569;
    }
  }

  .line-total {
    color: #0f172a;
    font-size: 12px;
    font-weight: 700;
  }

  .detail-footer {
    padding: 12px 16px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .price-breakdown {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: white;
    border: 1px solid #e2e8f0;
    padding: 8px 12px;
    border-radius: 10px;
  }

  .breakdown-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #475569;
    font-size: 11.5px;
    font-weight: 500;
  }

  .breakdown-row.discount {
    color: #10b981;
    font-weight: 600;
  }

  .breakdown-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 4px 0;
  }

  .breakdown-row.total {
    color: #0f172a;
    font-size: 14.5px;
    font-weight: 800;
  }

  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .actions-row-primary {
    width: 100%;
  }

  .actions-grid-secondary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .detail-actions ${ActionBtn} {
    padding: 6px 12px;
    font-size: 11px;
    border-radius: 8px;
    font-weight: 700;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    
    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 3px 5px -1px rgba(0,0,0,0.08);
    }
    
    &:active {
      transform: translateY(0);
    }
  }
`;

export const HeaderModeSwitch = styled.div`
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 9px;
  align-items: center;
  box-shadow: inset 0 1px 2.5px rgba(15, 23, 42, 0.08);
  border: 1.5px solid #edf2f7;

  @media (max-width: 900px) {
    width: 100%;
    gap: 2px;
    button {
      flex: 1;
    }
  }
`;

export const ModeToggleBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid ${props => props.$active ? '#ea580c' : 'transparent'};
  background: ${props => props.$active ? '#f97316' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#64748b'};
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: -0.015em;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: ${props => props.$active ? '0 2px 4px rgba(15, 23, 42, 0.08)' : 'none'};
  transition: all 0.15s ease;

  &:hover {
    color: ${props => props.$active ? 'white' : '#0f172a'};
    background: ${props => props.$active ? '#ea580c' : 'rgba(15, 23, 42, 0.04)'};
  }
`;

export const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding: 12px 16px;
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 600px) {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    padding: 8px;
    gap: 8px;
  }

  @media (min-width: 1600px) {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 14px;
  }
`;

export const OrderCard = styled.div`
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e7ec;
  border-left: 4px solid ${props => props.$statusColor || '#9ca3af'};
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 8px 12px;
  gap: 0;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.10);
  }
`;

export const BoardCardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
`;

export const CardOrderId = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: #ea580c;
  letter-spacing: 0.02em;
  font-family: 'SF Mono', 'Consolas', monospace;

  &:hover {
    color: #6366f1;
    text-decoration: underline;
  }
`;

export const CardTime = styled.span`
  font-size: 10px;
  font-weight: 500;
  color: #9ca3af;
  display: inline-flex;
  align-items: center;
  gap: 3px;
`;

export const CardFulfillmentBadge = styled.span`
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 4px;
  background: ${props => props.$bg || '#f3f4f6'};
  color: ${props => props.$fg || '#6b7280'};
  border: 1px solid ${props => props.$border || '#e5e7eb'};
  display: inline-flex;
  align-items: center;
  gap: 3px;
`;

export const CardTableLabel = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  text-align: center;
  padding: 8px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

export const CardItemsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 78px;
  overflow-y: auto;
  padding: 2px 0;
  border-top: 1px solid #f3f4f6;
  border-bottom: 1px solid #f3f4f6;
  margin: 4px 0;

  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
`;

export const CardItemRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  height: 26px;
  box-sizing: border-box;

  .item-name {
    flex: 1;
    font-size: 11.5px;
    font-weight: 500;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-qty {
    font-size: 10px;
    font-weight: 700;
    color: #374151;
    background: #f3f4f6;
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
  }
`;

export const CardDivider = styled.div`
  display: none;
`;

export const BoardCardFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  margin-top: 2px;
`;

export const CardTotal = styled.div`
  display: flex;
  flex-direction: column;

  .total-label {
    font-size: 8px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .total-val {
    font-size: 14px;
    font-weight: 700;
    color: #111827;
  }
`;

export const CardStatusBadge = styled.span`
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 4px;
  background: ${props => props.style?.background || '#f3f4f6'};
  color: ${props => props.style?.color || '#6b7280'};
  border: 1px solid ${props => props.style?.borderColor || '#e5e7eb'};
`;

export const CardActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid #f3f4f6;
`;

export const CardActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
  width: 100%;
`;

export const CardActionBtn = styled.button`
  height: 28px;
  border-radius: 6px;
  border: 1px solid ${props => props.$border || '#e5e7eb'};
  background: ${props => props.$bg || '#f9fafb'};
  color: ${props => props.$fg || '#374151'};
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
  white-space: nowrap;
  padding: 0 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);

  &:hover {
    background: ${props => props.$hoverBg || '#f3f4f6'};
    border-color: ${props => props.$hoverBorder || '#cbd5e1'};
    color: ${props => props.$hoverFg || '#111827'};
    transform: translateY(-0.5px);
    box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  }

  &:active {
    background: ${props => props.$hoverBg || '#e5e7eb'};
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }
`;

