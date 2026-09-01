import styled, { keyframes } from 'styled-components';

// ─── Theme ───────────────────────────────────────────────────────────────────

export const THEMES = {
  orange: {
    primary: '#f97316',
    primaryDark: '#ea580c',
    primaryLight: '#fff7ed',
    primaryGradient: 'linear-gradient(135deg, #f97316, #ea580c)'
  },
  green: {
    primary: '#10b981',
    primaryDark: '#059669',
    primaryLight: '#f0fdf4',
    primaryGradient: 'linear-gradient(135deg, #10b981, #059669)'
  }
};

// ─── Layout ──────────────────────────────────────────────────────────────────

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

export const Card = styled.div`
  width: min(340px, 100%);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  background: white;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  gap: 12px;

  @media (max-width: 640px) {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: 20px 20px 0 0;
    padding: 16px 14px calc(16px + env(safe-area-inset-bottom, 0px));
  }
`;

// ─── Header ──────────────────────────────────────────────────────────────────

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: 17px;
    font-weight: 900;
  }

  span {
    display: block;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    margin-top: 2px;
  }
`;

export const CloseButton = styled.button`
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

// ─── Summary ─────────────────────────────────────────────────────────────────

export const TotalBanner = styled.div`
  border-radius: 12px;
  padding: 12px 14px;
  background: ${props => props.$theme?.primaryGradient || 'linear-gradient(135deg, #f97316, #ea580c)'};
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;

  span {
    font-size: 11px;
    letter-spacing: 0.05em;
    font-weight: 800;
    text-transform: uppercase;
    opacity: 0.9;
  }

  strong {
    font-size: 22px;
    font-weight: 900;
  }
`;

export const Breakdown = styled.div`
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
`;

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;

  strong {
    color: #0f172a;
    font-weight: 800;
  }
`;

// ─── Form fields ─────────────────────────────────────────────────────────────

export const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
`;

export const Field = styled.label`
  display: grid;
  gap: 4px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;

  input,
  select {
    min-width: 0;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px 10px;
    color: #0f172a;
    font-size: 13px;
    font-weight: 700;
    outline: none;
  }
`;

// ─── Split payment ───────────────────────────────────────────────────────────

export const SplitPanel = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px;
  display: grid;
  gap: 8px;
`;

export const SplitRow = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1fr auto;
  gap: 6px;
  align-items: end;
`;

export const IconButton = styled.button`
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: ${props => props.$danger ? '#fee2e2' : '#e0f2fe'};
  color: ${props => props.$danger ? '#dc2626' : '#0369a1'};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

export const SplitFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 11px;
  font-weight: 800;

  button {
    border: 0;
    border-radius: 8px;
    padding: 6px 10px;
    background: ${props => props.$theme?.primaryLight || '#fff7ed'};
    color: ${props => props.$theme?.primaryDark || '#ea580c'};
    font-weight: 800;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }
`;

// ─── Credit panel ─────────────────────────────────────────────────────────────

export const CreditPanel = styled.div`
  border: 1px solid #99f6e4;
  border-radius: 12px;
  background: #f0fdfa;
  padding: 10px;
  display: grid;
  gap: 6px;
`;

export const CreditLabel = styled.div`
  color: #0f766e;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
`;

export const CreditPickerRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: center;
`;

export const NewCreditButton = styled.button`
  min-height: 38px;
  border: 1px solid #99f6e4;
  border-radius: 10px;
  background: white;
  color: #0f766e;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

// ─── Method grid ─────────────────────────────────────────────────────────────

export const MethodGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
`;

export const MethodButton = styled.button`
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid ${props => props.$active ? (props.$theme?.primary || '#f97316') : '#e2e8f0'};
  background: ${props => props.$active ? (props.$theme?.primaryLight || '#fff7ed') : 'white'};
  color: ${props => props.$active ? (props.$theme?.primaryDark || '#ea580c') : '#64748b'};
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
`;

// ─── Actions ─────────────────────────────────────────────────────────────────

export const Actions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 10px;
  margin-top: 6px;
`;

export const Button = styled.button`
  border: 0;
  border-radius: 12px;
  min-height: 44px;
  cursor: pointer;
  background: ${props => props.$primary ? (props.$theme?.primaryGradient || 'linear-gradient(135deg, #f97316, #ea580c)') : '#f1f5f9'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  font-size: 13px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

export const ErrorText = styled.div`
  color: #dc2626;
  font-size: 11px;
  font-weight: 800;
`;

export const DiscountBtn = styled.button`
  width: 100%;
  height: 28px;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
  background: white;
  color: #475569;
  font-weight: 700;
  font-size: 11.5px;
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

// ─── Discount modal ──────────────────────────────────────────────────────────

export const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 100005;
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

