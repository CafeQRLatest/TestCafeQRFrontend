import styled, { keyframes } from 'styled-components';

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  @media (max-width: 760px) {
    align-items: flex-end;
    padding: 0;
  }
`;

export const Panel = styled.div`
  width: min(980px, 100%);
  height: min(760px, calc(100dvh - 40px));
  background: #f8fafc;
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;

  @media (max-width: 760px) {
    width: 100%;
    height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: 24px 24px 0 0;
  }
`;

export const Header = styled.div`
  background: white;
  border-bottom: 1px solid #f1f5f9;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-width: 0;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: 14px;
    font-weight: 500;
    overflow-wrap: anywhere;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  span {
    display: block;
    color: #64748b;
    font-size: 10px;
    font-weight: 400;
    margin-top: 1px;
    letter-spacing: 0.5px;
  }
`;

export const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 4px;
  border-radius: 4px;
  &:hover {
    color: #ef4444;
    background: #f1f5f9;
  }
`;

export const Body = styled.div`
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 16px;
  padding: 16px;

  @media (max-width: 760px) {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 12px;
  }
`;

export const Section = styled.section`
  min-height: 0;
  background: white;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 760px) {
    overflow: visible;
    flex: none;
    min-height: 250px;
  }
`;

export const SectionHead = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  display: grid;
  gap: 8px;

  strong {
    color: #334155;
    font-size: 14px;
    font-weight: 500;
  }
`;

export const SearchBox = styled.div`
  position: relative;

  svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 13px;
  }

  input {
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px 12px 10px 34px;
    font-weight: 400;
    color: #0f172a;
    outline: none;
    font-size: 13px;
    transition: all 0.2s ease;
    &:focus {
      border-color: #f97316;
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
    }
  }
`;

export const ScrollList = styled.div`
  overflow-y: auto;
  min-height: 0;
  padding: 12px;
  display: grid;
  gap: 8px;

  @media (max-width: 760px) {
    overflow-y: visible;
  }
`;

export const ProductButton = styled.button`
  border: 1px solid #f1f5f9;
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  min-width: 0;
  transition: all 0.2s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  strong {
    display: block;
    color: #0f172a;
    font-size: 13px;
    font-weight: 500;
  }

  span {
    display: block;
    margin-top: 2px;
    color: #64748b;
    font-size: 11px;
    font-weight: 400;
  }
`;

export const ProductAction = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: #f97316;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
`;

export const LineRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
  transition: border-color 0.2s;

  &:hover {
    border-color: #e2e8f0;
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

export const LineInfo = styled.div`
  min-width: 0;

  strong {
    display: block;
    color: #0f172a;
    font-size: 13px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    margin-top: 2px;
    color: #64748b;
    font-size: 11px;
    font-weight: 400;
  }
`;

export const QtyGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;

  @media (max-width: 520px) {
    justify-content: space-between;
    width: 100%;
  }
`;

export const QtyInput = styled.input`
  border: 0;
  background: transparent;
  color: #0f172a;
  font-size: 11px;
  font-weight: 500;
  width: 20px;
  text-align: center;
  padding: 0;
  margin: 0;
  outline: none;
  -moz-appearance: textfield;
  
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;

export const IconButton = styled.button`
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: ${props => props.$danger ? '#fee2e2' : 'white'};
  color: ${props => props.$danger ? '#dc2626' : '#475569'};
  border: ${props => props.$danger ? '0' : '1px solid #e2e8f0'};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${props => props.$danger ? '#fca5a5' : '#f1f5f9'};
    color: ${props => props.$danger ? '#b91c1c' : '#0f172a'};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const Footer = styled.div`
  background: white;
  border-top: 1px solid #f1f5f9;
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
    padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  }
`;

export const SummaryDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #64748b;
  min-width: 180px;

  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .total-row {
    color: #0f172a;
    font-size: 14px;
    font-weight: 500;
    margin-top: 4px;
    border-top: 1px dashed #e2e8f0;
    padding-top: 4px;
  }
`;

export const SaveButton = styled.button`
  border: 0;
  border-radius: 10px;
  background: #f97316;
  color: white;
  min-height: 40px;
  padding: 0 18px;
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.2s, transform 0.1s;

  &:hover:not(:disabled) {
    background: #ea580c;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  @media (max-width: 520px) {
    width: 100%;
    justify-content: center;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 400;
`;

export const LoadingBubble = styled.div`
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 1390;
  transform: translate(-50%, -50%);
  padding: 10px 16px;
  border-radius: 10px;
  background: white;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-size: 13px;
  font-weight: 500;
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const DiscountBtn = styled.button`
  width: 100%;
  height: 36px;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
  background: white;
  color: #475569;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
    color: #0f172a;
  }
`;

export const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const DiscountModalContent = styled.div`
  background: white;
  width: min(480px, 94vw);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${fadeIn} 0.2s ease-out;
`;

export const DiscountModalHeader = styled.div`
  padding: 8px 12px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

export const DiscountTabHeader = styled.div`
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 0 16px;
`;

export const DiscountTabButton = styled.button`
  flex: 1;
  padding: 12px 8px;
  border: none;
  background: transparent;
  color: ${props => props.$active ? props.$themeColor : '#64748b'};
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  font-family: 'Outfit', sans-serif;
  &:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 25%;
    right: 25%;
    height: 3px;
    border-radius: 99px;
    background: ${props => props.$active ? props.$themeColor : 'transparent'};
    transition: all 0.2s;
  }
`;

export const DiscountModalBody = styled.div`
  padding: 16px 20px;
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const DiscountModalFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #edf2f7;
  display: flex;
  gap: 10px;
`;

export const DiscountRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f8fafc;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #edf2f7;
`;

export const DiscountRowInfo = styled.div`
  flex: 1;
  min-width: 0;
  span {
    display: block;
    font-weight: 700;
    font-size: 13px;
    color: #1e293b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
  }
`;

export const DiscountInputWrapper = styled.div`
  display: flex;
  align-items: center;
  background: white;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  padding: 2px;
  height: 32px;
  &:focus-within {
    border-color: ${props => props.$themeColor};
  }
`;

export const DiscUnitToggle = styled.button`
  border: none;
  background: ${props => props.$active ? props.$themeColor : 'transparent'};
  color: ${props => props.$active ? 'white' : '#64748b'};
  width: 22px;
  height: 22px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  &:hover {
    background: ${props => props.$active ? props.$themeColor : '#f1f5f9'};
  }
`;

export const RoundOffField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  width: 100%;
  max-width: 180px;

  input {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px 10px;
    color: #0f172a;
    font-size: 13px;
    font-weight: 700;
    outline: none;
    background: white;
    transition: all 0.2s ease;
    &:focus {
      border-color: #f97316;
    }
  }
`;

export const FooterControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
  
  @media (max-width: 520px) {
    width: 100%;
  }
`;
