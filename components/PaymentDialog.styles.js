import styled, { keyframes } from 'styled-components';

// ─── Theme ───────────────────────────────────────────────────────────────────

export const THEMES = {
  orange: {
    name: 'orange',
    primary: '#f97316',
    primaryDark: '#ea580c',
    primaryLight: '#fff7ed',
    primaryBorder: '#fed7aa',
    primaryOutline: '#fb923c',
    primaryGradient: 'linear-gradient(135deg, #fb923c, #ea580c)',
    badgeBg: '#fff7ed',
    badgeBorder: '#fed7aa',
    badgeColor: '#c2410c',
    amountColor: '#ea580c',
    btnBorder: '#fed7aa',
    btnSelectedBg: '#fff7ed',
    btnSelectedBorder: '#ea580c',
    btnSelectedColor: '#ea580c',
  },
  green: {
    name: 'green',
    primary: '#10b981',
    primaryDark: '#059669',
    primaryLight: '#f0fdf4',
    primaryBorder: '#bbf7d0',
    primaryOutline: '#34d399',
    primaryGradient: 'linear-gradient(135deg, #10b981, #059669)',
    badgeBg: '#f0fdf4',
    badgeBorder: '#bbf7d0',
    badgeColor: '#15803d',
    amountColor: '#059669',
    btnBorder: '#bbf7d0',
    btnSelectedBg: '#f0fdf4',
    btnSelectedBorder: '#059669',
    btnSelectedColor: '#047857',
  }
};

// ─── Layout ──────────────────────────────────────────────────────────────────

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);

  @media (max-width: 640px) {
    align-items: center;
    padding: 14px 12px;
  }
`;

export const Card = styled.div`
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100dvh - 36px);
  overflow-y: auto;
  background: white;
  border-radius: 20px;
  padding: 18px 22px;
  box-shadow: 0 20px 50px -10px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 14px;

  @media (max-width: 640px) {
    width: min(520px, calc(100vw - 24px));
    max-height: calc(100dvh - 28px);
    border-radius: 16px;
    padding: 13px 15px;
    gap: 9px;
  }
`;

export const DialogBody = styled.div`
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  align-items: start;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 9px;
  }
`;

export const DialogColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;

  @media (max-width: 600px) {
    gap: 7px;
  }
`;

// ─── Header ──────────────────────────────────────────────────────────────────

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;

  h2 {
    margin: 0;
    color: #0f172a;
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  span {
    display: block;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    margin-top: 2px;
  }

  @media (max-width: 600px) {
    padding-bottom: 6px;

    h2 {
      font-size: 15.5px;
    }
  }
`;

export const CloseButton = styled.button`
  border: 1px solid #f1f5f9;
  background: #f8fafc;
  color: #94a3b8;
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  &:hover {
    background: #e2e8f0;
    color: #0f172a;
    transform: rotate(90deg) scale(1.05);
  }

  @media (max-width: 600px) {
    width: 26px;
    height: 26px;
  }
`;

// ─── Summary ─────────────────────────────────────────────────────────────────

export const TotalBanner = styled.div`
  border-radius: 14px;
  padding: 13px 18px;
  background: ${props => props.$theme?.name === 'green'
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'};
  border: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: ${props => props.$theme?.name === 'green'
    ? '0 4px 14px rgba(5, 150, 105, 0.22)'
    : '0 4px 14px rgba(234, 88, 12, 0.25)'};

  span {
    font-size: 13px;
    letter-spacing: 0.05em;
    font-weight: 700;
    text-transform: uppercase;
    color: #ffffff;
    opacity: 0.95;
  }

  strong {
    font-size: 24px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.01em;
  }

  @media (max-width: 600px) {
    padding: 8px 14px;
    border-radius: 10px;

    span {
      font-size: 11px;
    }

    strong {
      font-size: 18px;
    }
  }
`;

export const Breakdown = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  padding: 13px 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);

  @media (max-width: 600px) {
    padding: 8px 12px;
    gap: 4px;
    border-radius: 10px;
  }
`;

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 12.5px;
  font-weight: 500;

  span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  strong {
    color: #1e293b;
    font-weight: 600;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 600px) {
    font-size: 11px;

    strong {
      font-size: 11.5px;
    }
  }
`;

export const TaxBadge = styled.span`
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: #e2e8f0;
  color: #475569;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

export const GrandTotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px dashed #cbd5e1;
  padding-top: 9px;
  margin-top: 2px;

  span {
    font-size: 13.5px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
  }

  strong {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 600px) {
    padding-top: 5px;
    margin-top: 1px;

    span {
      font-size: 12px;
    }

    strong {
      font-size: 14px;
    }
  }
`;

// ─── Form fields ─────────────────────────────────────────────────────────────

export const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
`;

export const Field = styled.label`
  display: grid;
  gap: 5px;
  color: #64748b;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  input,
  select {
    min-width: 0;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 8px 12px;
    color: #0f172a;
    font-size: 13px;
    font-weight: 600;
    outline: none;
    background: #ffffff;
    transition: all 0.15s ease;

    &:focus {
      border-color: #f97316;
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
    }
  }
`;

// ─── Split payment ───────────────────────────────────────────────────────────

export const SplitPanel = styled.div`
  border: 1px solid ${props => props.$theme?.badgeBorder || '#fed7aa'};
  border-radius: 14px;
  background: #ffffff;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
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
  max-height: 230px;
  overflow-y: auto;
  padding-right: 2px;

  @media (max-width: 600px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    max-height: none;
  }
`;

export const MethodButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 8px 10px;
  border-radius: 10px;
  border: ${props => props.$active ? `2px solid ${props.$borderColor}` : `1.5px solid ${props.$borderColor}`};
  background: ${props => props.$bg || '#ffffff'};
  color: ${props => props.$color || '#334155'};
  font-size: 12.5px;
  font-weight: ${props => props.$active ? '700' : '600'};
  cursor: pointer;
  text-align: center;
  transition: all 0.15s ease;
  box-shadow: ${props => props.$shadow || '0 1px 2px rgba(0, 0, 0, 0.02)'};
  line-height: 1.2;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    min-height: 34px;
    padding: 6px 4px;
    font-size: 11px;
    border-radius: 8px;
  }
`;

// ─── Actions ─────────────────────────────────────────────────────────────────

export const Actions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 10px;
  margin-top: 6px;

  @media (max-width: 600px) {
    gap: 7px;
    margin-top: 3px;
  }
`;

export const Button = styled.button`
  border: ${props => props.$primary ? 'none' : '1px solid #e2e8f0'};
  border-radius: 12px;
  min-height: 42px;
  cursor: pointer;
  background: ${props => props.$primary ? (props.$theme?.primaryGradient || 'linear-gradient(135deg, #fb923c, #ea580c)') : '#f8fafc'};
  color: ${props => props.$primary ? 'white' : '#475569'};
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: ${props => props.$primary ? '0 3px 10px rgba(249, 115, 22, 0.22)' : '0 1px 2px rgba(0,0,0,0.02)'};
  transition: all 0.15s ease;

  &:hover {
    filter: brightness(0.97);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 600px) {
    min-height: 36px;
    font-size: 12px;
    border-radius: 9px;
  }
`;

export const ErrorText = styled.div`
  color: #dc2626;
  font-size: 11px;
  font-weight: 800;
`;

export const DiscountBtn = styled.button`
  width: 100%;
  min-height: 35px;
  border-radius: 10px;
  border: 1px solid ${props => props.$applied
    ? (props.$theme?.name === 'green' ? '#86efac' : '#fdba74')
    : (props.$theme?.name === 'green' ? '#bbf7d0' : '#fed7aa')};
  background: ${props => props.$applied
    ? (props.$theme?.name === 'green' ? '#f0fdf4' : '#fff7ed')
    : '#ffffff'};
  color: ${props => props.$theme?.name === 'green' ? '#059669' : '#ea580c'};
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  transition: all 0.15s ease;

  &:hover {
    background: ${props => props.$theme?.name === 'green' ? '#ecfdf5' : '#fff7ed'};
    border-color: ${props => props.$theme?.name === 'green' ? '#059669' : '#ea580c'};
    color: ${props => props.$theme?.name === 'green' ? '#047857' : '#c2410c'};
    transform: translateY(-1px);
  }

  @media (max-width: 600px) {
    min-height: 29px;
    font-size: 11px;
    border-radius: 7px;
    gap: 4px;
    padding: 0 8px;
  }
`;

export const RoundOffBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px 12px;

  @media (max-width: 600px) {
    padding: 6px 10px;
    gap: 3px;
    border-radius: 9px;

    input {
      padding: 5px 8px 5px 22px !important;
      font-size: 12px !important;
      height: 28px !important;
    }
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

