import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import styled, { keyframes } from 'styled-components';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatTzDate } from '../utils/timezoneUtils';
import {
  FaPlus, FaMinus, FaSearch, FaUtensils,
  FaWallet, FaFire, FaArrowLeft, FaLeaf, FaChevronRight, FaTimes, FaShoppingBag, FaUsers, FaBook, FaTag,
  FaHistory, FaReceipt
} from 'react-icons/fa';
import { calculateOrderTotals } from '../utils/orderCalculations';
import { isKnownOffline } from '../utils/networkState';
import { allocateOfflineSequence, ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../utils/offlineSequences';
import VariantSelector from './VariantSelector';
import NiceSelect from './NiceSelect';
import CreditCustomerQuickCreateModal from './CreditCustomerQuickCreateModal';
import PremiumDateTimePicker from './PremiumDateTimePicker';

// ─── Animations ───────────────────────────────────────────────────────────────
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ─── Layout shells ────────────────────────────────────────────────────────────
const Wrapper = styled.div`
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  flex: 1;
`;

const Shell = styled.div`
  background: #f8fafc;
  width: 100%;
  height: calc(100vh - 60px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
`;

// ─── Top header ───────────────────────────────────────────────────────────────
const TopBar = styled.header`
  padding: 8px 20px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const BackBtn = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s;
  &:hover { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
`;

const AccentTitle = styled.div`
  display: flex;
  align-items: center;
  border-left: 4px solid ${p => p.$color || '#16a34a'};
  border-radius: 2px;
  padding: 0 0 0 10px;
  gap: 6px;
`;

const PageTitle = styled.h1`
  margin: 0;
  font-family: 'Outfit','Inter',-apple-system,sans-serif;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
`;

const PageSub = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
`;

const ModeSwitch = styled.div`
  display: flex;
  gap: 3px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 9px;
  align-items: center;
  box-shadow: inset 0 1px 2px rgba(15,23,42,0.07);
  border: 1.5px solid #edf2f7;
`;

const ModeBtn = styled.button`
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid ${p => {
    if (!p.$active) return 'transparent';
    return p.$color === '#f97316' ? '#ea580c' : '#15803d';
  }};
  background: ${p => {
    if (!p.$active) return 'transparent';
    return p.$color === '#f97316' ? '#f97316' : '#16a34a';
  }};
  color: ${p => p.$active ? 'white' : '#64748b'};
  font-family: 'Outfit','Inter',-apple-system,sans-serif;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: ${p => p.$active ? '0 2px 4px rgba(15,23,42,0.08)' : 'none'};
  transition: all 0.15s;
  &:hover {
    color: ${p => p.$active ? 'white' : '#0f172a'};
    background: ${p => {
      if (p.$active) return p.$color === '#f97316' ? '#ea580c' : '#15803d';
      return 'rgba(15,23,42,0.04)';
    }};
  }
`;

const HeaderBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg,#f97316 0%,#ea580c 100%);
  color: white;
  font-family: 'Outfit','Inter',-apple-system,sans-serif;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(249,115,22,0.25);
  transition: all 0.2s;
  &:hover {
    background: linear-gradient(135deg,#ea580c 0%,#d97706 100%);
    box-shadow: 0 4px 12px rgba(249,115,22,0.35);
  }
  @media (max-width: 680px) { span { display: none; } }
`;

const CreditToggleBtn = styled.button`
  height: 30px;
  border: 1px solid ${p => p.$active ? '#14b8a6' : '#99f6e4'};
  border-radius: 8px;
  background: ${p => p.$active ? '#14b8a6' : 'white'};
  color: ${p => p.$active ? 'white' : '#0f766e'};
  padding: 0 10px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-shadow: ${p => p.$active ? '0 6px 16px rgba(20,184,166,0.16)' : 'none'};
`;

// ─── Main two-column layout ────────────────────────────────────────────────────
const MainLayout = styled.main`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  gap: 0;

  @media (max-width: 900px) {
    flex-direction: column;
    overflow-y: auto;
  }
`;

// ─── LEFT PANEL: Search + Results ─────────────────────────────────────────────
const LeftPanel = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  gap: 14px;
  min-width: 0;
  overflow: hidden;

  @media (max-width: 900px) {
    overflow: visible;
    padding: 14px 16px 0;
  }
`;

const SearchWrap = styled.div`
  position: relative;
  width: 100%;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 15px;
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  height: 44px;
  box-sizing: border-box;
  padding: 0 16px 0 44px;
  background: white;
  color: #0f172a;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  transition: all 0.2s;
  font-family: 'Outfit','Inter',-apple-system,sans-serif;
  &:focus {
    border-color: ${p => p.$color || '#16a34a'};
    box-shadow: 0 0 0 3px ${p => p.$color || '#16a34a'}18;
  }
  &::placeholder { color: #94a3b8; font-weight: 500; }
`;

const SearchHintCard = styled.div`
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  padding: 28px;
  color: #94a3b8;
  font-weight: 700;
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
  background: white;
`;

const ResultsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  overflow-y: auto;
  padding-bottom: 12px;
  flex: 1;
  min-height: 0;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ProductCard = styled.div`
  border: 1.5px solid ${p => p.$inCart ? p.$color : '#e2e8f0'};
  background: ${p => p.$inCart ? `${p.$color}06` : '#fff'};
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  transition: all 0.18s;
  min-width: 0;

  &:hover {
    border-color: ${p => p.$color};
    box-shadow: 0 6px 20px ${p => p.$color}18;
    transform: translateY(-1px);
  }
`;

const ProductMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  strong {
    color: #0f172a;
    font-size: 13px;
    font-weight: 800;
    overflow-wrap: anywhere;
    line-height: 1.3;
  }

  span {
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
  }
`;

const DietDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${p => p.$nonVeg ? '#dc2626' : '#16a34a'};
`;

const AddIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: ${p => p.$color}18;
  color: ${p => p.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: 13px;
  transition: all 0.18s;

  ${ProductCard}:hover & {
    background: ${p => p.$color};
    color: white;
  }
`;

const InlineStepperWrap = styled.div`
  display: flex;
  align-items: center;
  background: white;
  border: 1.5px solid ${p => p.$color};
  border-radius: 8px;
  height: 30px;
  overflow: hidden;
  flex: 0 0 auto;
`;

const StepBtn = styled.button`
  border: 0;
  background: ${p => p.$color}12;
  color: ${p => p.$color};
  width: 28px;
  height: 100%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  transition: background 0.15s;
  &:hover { background: ${p => p.$color}26; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const StepVal = styled.div`
  font-weight: 800;
  font-size: 12px;
  min-width: 22px;
  text-align: center;
  color: #0f172a;
`;

const VariantBadge = styled.span`
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  padding: 0 4px;
  background: ${p => p.$color};
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 900;
`;

// ─── RIGHT PANEL: Order + Totals ──────────────────────────────────────────────
const RightPanel = styled.aside`
  width: clamp(300px, 26vw, 380px);
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 900px) {
    width: 100%;
    border-left: none;
    border-top: 1px solid #e2e8f0;
    min-height: 320px;
  }
`;

const RightHeader = styled.div`
  padding: 10px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const RightTitle = styled.div`
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
`;

const CartCount = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: ${p => p.$color};
`;

const CartBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
`;

const EmptyCart = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #94a3b8;
  padding: 32px 20px;
  text-align: center;
`;

const CartRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  background: white;
  box-shadow: 0 1px 2px rgba(15,23,42,0.01);
  transition: border-color 0.15s;
  &:hover { border-color: #cbd5e1; }
`;

const CartRowTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
`;

const CartRowName = styled.div`
  font-weight: 700;
  font-size: 11.5px;
  color: #1e293b;
  line-height: 1.3;
  word-break: break-word;
  flex: 1;
  min-width: 0;
`;

const QtyGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  padding: 2px 4px;
  border-radius: 5px;
  flex-shrink: 0;
`;

const QtyBtn = styled.button`
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  background: white;
  color: #475569;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 7px;
  transition: background 0.15s;
  &:hover { background: #f8fafc; color: #0f172a; }
`;

const CartRowBottom = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
`;

const CartRowPrice = styled.div`
  font-size: 10.5px;
  color: #64748b;
  font-weight: 600;
`;

const CartRowTotal = styled.div`
  font-size: 12px;
  font-weight: 800;
  color: ${p => p.$color};
`;

// ─── Customer panel ───────────────────────────────────────────────────────────
const CustomerPanel = styled.div`
  padding: 10px 14px;
  border-bottom: 1px solid #edf2f7;
  background: #fafafa;
`;

const CustomerLabel = styled.div`
  font-size: 10px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
`;

const CustomerInputWrap = styled.div`
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 8px;
  height: 32px;
  gap: 6px;
  &:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
`;

const CustomerInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  min-width: 60px;
  &::placeholder { color: #94a3b8; font-weight: 500; }
`;

const CustomerDropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  padding: 6px;
  gap: 3px;
  z-index: 120;
`;

const CustomerOption = styled.button`
  text-align: left;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
  &:hover { background: #f8fafc; }
`;

const CustomerChip = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
`;

// ─── Totals footer ─────────────────────────────────────────────────────────────
const CartFooter = styled.div`
  padding: 10px 14px;
  border-top: 1px solid #e2e8f0;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TotalsBox = styled.div`
  background: #f8fafc;
  border: 1px solid #edf2f7;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: ${p => p.$bold ? '14px' : '11px'};
  font-weight: ${p => p.$bold ? '900' : '600'};
  color: ${p => p.$bold ? '#0f172a' : '#64748b'};
`;

const TotalDivider = styled.div`
  height: 1px;
  background: #e2e8f0;
  margin: 4px 0;
`;

const DiscBtn = styled.button`
  width: 100%;
  height: 30px;
  border-radius: 7px;
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
  &:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }
`;

const PayBtn = styled.button`
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  background: linear-gradient(135deg, ${p => p.$color} 0%, ${p => p.$dark} 100%);
  color: white;
  font-size: 14px;
  font-weight: 800;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px -2px ${p => p.$color}40;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  transition: transform 0.1s, box-shadow 0.1s;
  font-family: 'Outfit','Inter',-apple-system,sans-serif;
  &:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -2px ${p => p.$color}50; }
  &:active { transform: translateY(1px); }
  &:disabled { background: #cbd5e1; color: #94a3b8; box-shadow: none; cursor: not-allowed; transform: none; }
`;

// ─── Discount Modal ────────────────────────────────────────────────────────────
const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.4);
  backdrop-filter: blur(4px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const DiscountModal = styled.div`
  background: white;
  width: min(480px, 94vw);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15,23,42,0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${fadeIn} 0.2s ease-out;
`;

const DModalHead = styled.div`
  padding: 8px 12px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const DModalTabBar = styled.div`
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 0 16px;
`;

const DModalTab = styled.button`
  flex: 1;
  padding: 12px 8px;
  border: none;
  background: transparent;
  color: ${p => p.$active ? p.$color : '#64748b'};
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  position: relative;
  &:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 25%;
    right: 25%;
    height: 3px;
    border-radius: 99px;
    background: ${p => p.$active ? p.$color : 'transparent'};
  }
`;

const DModalBody = styled.div`
  padding: 16px 20px;
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const DModalFoot = styled.div`
  padding: 14px 20px;
  border-top: 1px solid #edf2f7;
  display: flex;
  gap: 10px;
`;

const DiscRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #f8fafc;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #edf2f7;
`;

const DiscRowInfo = styled.div`
  flex: 1;
  min-width: 0;
  span { display: block; font-weight: 700; font-size: 13px; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: #64748b; font-size: 11px; font-weight: 600; }
`;

const DiscInputWrap = styled.div`
  display: flex;
  align-items: center;
  background: white;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  padding: 2px;
  height: 32px;
  &:focus-within { border-color: ${p => p.$color}; }
`;

const DiscUnitBtn = styled.button`
  border: none;
  background: ${p => p.$active ? p.$color : 'transparent'};
  color: ${p => p.$active ? 'white' : '#64748b'};
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
`;

const OfflineBox = styled.div`
  margin: auto;
  max-width: 480px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  border-radius: 20px;
  padding: 24px;
  text-align: center;
  font-weight: 800;
  line-height: 1.6;
`;

const CreditSelectWrap = styled.div`
  flex: 1;
  min-width: 120px;
`;

const CreditNewBtn = styled.button`
  height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  color: #0f766e;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  &:hover { background: #f0fdfa; border-color: #5eead4; }
`;

const CreditMeta = styled.div`
  font-size: 10px;
  font-weight: 700;
  color: ${p => p.$warn ? '#c2410c' : '#64748b'};
  padding-left: 2px;
  margin-top: 3px;
`;

// ─── Date row ─────────────────────────────────────────────────────────────────
const DateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 280px;
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function StandardSale({
  onBack,
  initialTable,
  onOrderCreated,
  onCreditCustomerCreated,
  config: propConfig = null,
  initialCreditCustomers = null,
}) {
  const router = useRouter();
  const { timezone, orgId } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [products, setProducts]   = useState([]);
  const [search, setSearch]       = useState('');
  const [cart, setCart]           = useState([]);
  const [orderMode, setOrderMode] = useState('settle');
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [config, setConfig]       = useState(null);

  const [variantProduct, setVariantProduct]   = useState(null);
  const [variantLoading, setVariantLoading]   = useState(false);

  const [allCustomers, setAllCustomers]   = useState([]);
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAge, setCustomerAge]     = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomers, setSelectedCustomers]   = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [creditCustomers, setCreditCustomers]             = useState([]);
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const [isCreditSale, setIsCreditSale]                   = useState(false);
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);
  const [defaultPricelistId, setDefaultPricelistId]       = useState(null);

  const [showDiscountModal, setShowDiscountModal]     = useState(false);
  const [localDiscounts, setLocalDiscounts]           = useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = useState(0);
  const [discountModalTab, setDiscountModalTab]       = useState('line');
  const [discountType, setDiscountType]               = useState('amount');
  const [discountValue, setDiscountValue]             = useState(0);

  const [trendingProductIds, setTrendingProductIds]   = useState([]);

  const [orderDateTime, setOrderDateTime] = useState(() => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });

  const customerInputRef = useRef(null);
  const searchRef        = useRef(null);

  const propConfigRef            = useRef(propConfig);
  const initialCreditCustomersRef = useRef(initialCreditCustomers);

  useEffect(() => { propConfigRef.current = propConfig; }, [propConfig]);
  useEffect(() => { initialCreditCustomersRef.current = initialCreditCustomers; }, [initialCreditCustomers]);

  // sync prop changes passively
  useEffect(() => {
    if (propConfig) {
      setConfig(propConfig);
      if (!propConfig.creditEnabled) {
        setIsCreditSale(false);
        setSelectedCreditCustomerId('');
      }
    }
  }, [propConfig]);

  useEffect(() => {
    if (initialCreditCustomers) setCreditCustomers(initialCreditCustomers);
  }, [initialCreditCustomers]);

  // outside click → close dropdown
  useEffect(() => {
    const handler = (e) => {
      if (customerInputRef.current && !customerInputRef.current.contains(e.target))
        setShowCustomerDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // discount modal init
  useEffect(() => {
    if (showDiscountModal) {
      const initial = {};
      cart.forEach(item => {
        const key = cartKeyFor(item);
        if (item.discount_percent > 0)       initial[key] = { type: 'percentage', value: item.discount_percent };
        else if (item.discount_amount > 0)   initial[key] = { type: 'amount', value: item.discount_amount };
        else if (item.discount)              initial[key] = { type: item.discount.type || 'amount', value: item.discount.value || 0 };
        else                                 initial[key] = { type: 'amount', value: 0 };
      });
      setLocalDiscounts(initial);
      setLocalOrderDiscountType(discountType || 'amount');
      setLocalOrderDiscountValue(discountValue || 0);
      setDiscountModalTab('line');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiscountModal]);

  // reset discount on empty cart
  useEffect(() => {
    if (cart.length === 0) {
      setDiscountValue(0);
      setDiscountType('amount');
    }
  }, [cart.length]);

  // reset discount on kitchen mode
  useEffect(() => {
    if (orderMode === 'kitchen') {
      setDiscountValue(0);
      setDiscountType('amount');
    }
  }, [orderMode]);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const THEME = orderMode === 'kitchen'
    ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' }
    : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3' };

  // ── Load products & config ─────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setLoadError('');
    setProducts([]);
    setCart([]);
    setSearch('');
    setSelectedCustomerId(null);
    setSelectedCustomers([]);
    setShowCustomerDropdown(false);
    setSelectedCreditCustomerId('');
    setIsCreditSale(false);
    setShowNewCreditCustomer(false);
    setCreditCustomers([]);

    (async () => {
      try {
        const currentPropConfig  = propConfigRef.current;
        const currentCreditList  = initialCreditCustomersRef.current;
        const [pRes, cRes, custRes, creditRes, plRes] = await Promise.all([
          api.get('/api/v1/products'),
          currentPropConfig
            ? Promise.resolve({ data: { data: currentPropConfig } })
            : api.get('/api/v1/configurations'),
          api.get('/api/v1/purchasing/customers').catch(() => ({ data: { data: [] } })),
          currentCreditList
            ? Promise.resolve({ data: { data: currentCreditList } })
            : api.get('/api/v1/credit/customers', { params: { status: 'ACTIVE' } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/v1/purchasing/pricelists/type/SALE').catch(() => ({ data: { data: [] } })),
        ]);
        const pList = pRes.data.data || [];
        setProducts(pList);
        const nextConfig = cRes.data.data;
        setConfig(nextConfig);
        if (!nextConfig?.creditEnabled) { setIsCreditSale(false); setSelectedCreditCustomerId(''); }
        if (custRes?.data?.data)   setAllCustomers(custRes.data.data);
        if (creditRes?.data?.data) setCreditCustomers(creditRes.data.data);
        if (plRes?.data?.data) {
          const list = plRes.data.data || [];
          const def  = list.find(p => p.isDefault === true || p.is_default === true) || list[0];
          if (def) setDefaultPricelistId(def.id);
        }
      } catch (e) {
        if (e?.code === 'OFFLINE_CACHE_MISS') {
          setLoadError('Offline POS data is not prepared. Connect once, open POS, and wait for setup to finish.');
        } else {
          setLoadError('Failed to load POS data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  // trending memory
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(window.localStorage.getItem('cafeqr_recent_product_ids') || '[]');
      if (Array.isArray(stored)) setTrendingProductIds(stored.map(String));
    } catch { setTrendingProductIds([]); }
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const cartKeyFor = useCallback(
    (item) => String(item.cartKey || `${item.productId || item.id}:${item.variantId || 'base'}`),
    []
  );

  const cartItemCount = useMemo(
    () => cart.reduce((s, i) => s + Number(i.qty || 0), 0),
    [cart]
  );

  const selectedCreditCustomer = useMemo(
    () => creditCustomers.find(c => String(c.id) === String(selectedCreditCustomerId)) || null,
    [creditCustomers, selectedCreditCustomerId]
  );

  const creditCustomerOptions = useMemo(
    () => creditCustomers.map(c => ({
      value: c.id,
      label: `${c.name || 'Credit Customer'}${c.phone ? ` (${c.phone})` : ''} - ₹${Number(c.balance || 0).toFixed(2)}`,
    })),
    [creditCustomers]
  );

  const creditLimitWarning = useMemo(() => {
    if (!selectedCreditCustomer) return '';
    const limit = Number(selectedCreditCustomer.creditLimit || 0);
    if (limit <= 0) return '';
    const projected = Number(selectedCreditCustomer.balance || 0) + Number(totals?.total_amount || 0);
    return projected > limit ? `Credit limit warning: projected ₹${projected.toFixed(2)} exceeds ₹${limit.toFixed(2)}.` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreditCustomer, cart]);

  const hasExtendedOptions = useCallback(
    (p) => Boolean(p?.hasVariants) || Number(p?.variantCount || 0) > 0 || Boolean(p?.hasUpsells),
    []
  );

  const productCartLines    = useCallback((p) => {
    const pid = String(p?.id || p?.productId || '');
    return pid ? cart.filter(i => String(i.productId || i.id) === pid) : [];
  }, [cart]);

  const productCartQuantity = useCallback(
    (p) => productCartLines(p).reduce((s, i) => s + Number(i.qty || 0), 0),
    [productCartLines]
  );

  const baseProductCartLine = useCallback(
    (p) => productCartLines(p).find(i => !i.variantId),
    [productCartLines]
  );

  const variantQuantityMap = useCallback(
    (p) => productCartLines(p).reduce((acc, i) => {
      if (i.variantId) acc[String(i.variantId)] = Number(i.qty || 0);
      return acc;
    }, {}),
    [productCartLines]
  );

  const isNonVeg = useCallback((p) => {
    const t = String(p?.productType || p?.product_type || '').toUpperCase();
    return t.includes('NON') || t.includes('MEAT') || t.includes('CHICKEN') || t.includes('FISH');
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerPhone && !customerName) return [];
    const ln = customerName.toLowerCase();
    return allCustomers.filter(c =>
      (c.phone && c.phone.includes(customerPhone)) ||
      (c.name  && c.name.toLowerCase().includes(ln))
    ).slice(0, 5);
  }, [allCustomers, customerName, customerPhone]);

  // ── Search results ─────────────────────────────────────────────────────────
  const searchMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter(p => {
        if (p.isActive === false || p.isactive === 'N') return false;
        if (p.isIngredient === true || p.is_ingredient === true ||
            String(p.isIngredient).toUpperCase() === 'Y' ||
            String(p.is_ingredient).toUpperCase() === 'Y') return false;
        return String(p.name || '').toLowerCase().includes(term);
      })
      .slice(0, 16);
  }, [products, search]);

  // ── Cart mutations ─────────────────────────────────────────────────────────
  const addPreparedToCart = (product) => {
    setCart(prev => {
      const qty   = Math.max(1, Number(product.qty || 1));
      const prepared = {
        ...product,
        productId: product.productId || product.id,
        cartKey:   cartKeyFor(product),
        displayName: product.displayName || product.name,
        qty,
      };
      const key    = cartKeyFor(prepared);
      const exists = prev.find(i => cartKeyFor(i) === key);
      if (exists) return prev.map(i => cartKeyFor(i) === key ? { ...i, qty: Number(i.qty || 0) + qty } : i);
      return [...prev, prepared];
    });
  };

  const openVariantSelector = async (p) => {
    setVariantLoading(true);
    try {
      const { data } = await api.get(`/api/v1/products/${p.id}`);
      setVariantProduct({ ...p, ...(data.data || {}), categoryName: p.categoryName });
    } catch {
      alert('Unable to load item options. Please try again.');
    } finally {
      setVariantLoading(false);
    }
  };

  const addToCart = async (p) => {
    if (hasExtendedOptions(p)) { await openVariantSelector(p); return; }
    addPreparedToCart({ ...p, cartKey: `${p.id}:base`, productId: p.id, displayName: p.name });
  };

  const addVariantToCart = (variant, additionalItems = []) => {
    if (!variantProduct) return;
    if (variant) {
      const displayName = `${variantProduct.name} (${variant.label})`;
      addPreparedToCart({
        ...variantProduct,
        productId: variantProduct.id,
        variantId: variant.id,
        variantName: variant.label,
        name: displayName,
        displayName,
        price: variant.price,
        cartKey: `${variantProduct.id}:${variant.id}`,
      });
    }
    (additionalItems || []).forEach(i => addPreparedToCart(i));
    setVariantProduct(null);
  };

  const syncVariantCart = (selectedVariants, additionalItems = []) => {
    if (!variantProduct) return;
    const productId  = String(variantProduct.id);
    const nextLines  = (selectedVariants || [])
      .map(v => {
        const qty = Math.max(0, Number(v.quantity || 0));
        if (!qty) return null;
        const displayName = `${variantProduct.name} (${v.label})`;
        return { ...variantProduct, productId: variantProduct.id, variantId: v.id, variantName: v.label, name: displayName, displayName, price: v.price, qty, cartKey: `${variantProduct.id}:${v.id}` };
      }).filter(Boolean);
    setCart(prev => [
      ...prev.filter(i => !(String(i.productId || i.id) === productId && i.variantId)),
      ...nextLines,
    ]);
    (additionalItems || []).forEach(i => addPreparedToCart(i));
    setVariantProduct(null);
  };

  const updateQty = (key, delta) => {
    setCart(prev =>
      prev.map(i => cartKeyFor(i) === String(key) ? { ...i, qty: Math.max(0, Number(i.qty || 0) + delta) } : i)
          .filter(i => i.qty > 0)
    );
  };

  const decrementProduct = (e, p) => {
    e.stopPropagation();
    const line = baseProductCartLine(p);
    if (line) updateQty(cartKeyFor(line), -1);
  };

  const incrementProduct = (e, p) => {
    e.stopPropagation();
    addPreparedToCart({ ...p, cartKey: `${p.id}:base`, productId: p.id, displayName: p.name });
  };

  const addFromSearch = async (p) => {
    await addToCart(p);
    setSearch('');
    searchRef.current?.focus();
  };

  const currentVariantQuantities = useMemo(
    () => variantProduct ? variantQuantityMap(variantProduct) : {},
    [variantProduct, variantQuantityMap]
  );

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!config) return { subtotal: 0, tax: 0, total: 0, line_subtotal: 0, total_amount: 0, discount_amount: 0, total_tax: 0, taxable_amount: 0, total_tax_added: 0, total_tax_included: 0, round_off_amount: 0 };
    return calculateOrderTotals(
      cart.map(i => ({
        ...i,
        id: cartKeyFor(i),
        productId: i.productId || i.id,
        name: i.displayName || i.name,
        quantity: i.qty,
        tax_rate: i.taxRate || 0,
        is_packaged_good: i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true,
        is_packaged:       i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true,
      })),
      { type: discountType, value: discountValue },
      {
        gst_enabled: config.taxEnabled,
        default_tax_rate: (() => {
          if (!config.taxEnabled) return 0;
          const rates = config.taxRates || [];
          const def   = rates.find(r => r.id === config.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config.pricesIncludeTax,
        round_off_config: {
          round_off_enabled:    config.roundOffEnabled,
          round_off_mode:       config.roundOffMode || 'automatic',
          round_off_auto_factor: config.roundOffAutoFactor ?? 1,
          round_off_manual_limit: config.roundOffManualLimit ?? 10,
        },
      }
    );
  }, [cart, config, cartKeyFor, discountType, discountValue]);

  // ── Customer helpers ────────────────────────────────────────────────────────
  const selectCustomer = (c) => {
    if (config?.allowMultipleCustomersPerOrder) {
      if (!selectedCustomers.find(x => x.id === c.id)) setSelectedCustomers([...selectedCustomers, c]);
      setCustomerPhone('');
      setCustomerName('');
    } else {
      setSelectedCustomerId(c.id);
      setCustomerPhone(c.phone || '');
      setCustomerName(c.name || '');
    }
    setShowCustomerDropdown(false);
  };

  const removeCustomer = (id) => {
    if (id === selectedCustomerId) { setSelectedCustomerId(null); setCustomerName(''); setCustomerPhone(''); }
    else setSelectedCustomers(selectedCustomers.filter(c => c.id !== id));
  };

  const toggleCreditSale = () => {
    const next = !isCreditSale;
    setIsCreditSale(next);
    if (next) { setSelectedCustomerId(null); setSelectedCustomers([]); setShowCustomerDropdown(false); }
    else setSelectedCreditCustomerId('');
  };

  const handleCreditCustomerCreated = useCallback((customer) => {
    if (!customer?.id) return;
    setCreditCustomers(cur => {
      const next = [customer, ...cur.filter(i => String(i.id) !== String(customer.id))];
      return next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    });
    setSelectedCreditCustomerId(customer.id);
    onCreditCustomerCreated?.(customer);
  }, [onCreditCustomerCreated]);

  // ── Discount apply ─────────────────────────────────────────────────────────
  const handleApplyDiscounts = () => {
    setCart(prev => prev.map(item => {
      const key  = cartKeyFor(item);
      const disc = localDiscounts[key];
      if (!disc) return item;
      return disc.type === 'percentage'
        ? { ...item, discount_percent: disc.value, discount_amount: 0, discount: { type: 'percent', value: disc.value } }
        : { ...item, discount_percent: 0, discount_amount: disc.value, discount: { type: 'amount', value: disc.value } };
    }));
    setDiscountType(localOrderDiscountType);
    setDiscountValue(localOrderDiscountValue);
    setShowDiscountModal(false);
  };

  const handleClearAllDiscounts = () => {
    setLocalDiscounts(prev => {
      const next = {};
      Object.keys(prev).forEach(k => { next[k] = { type: 'amount', value: 0 }; });
      return next;
    });
    setLocalOrderDiscountType('amount');
    setLocalOrderDiscountValue(0);
  };

  // ── Place order ────────────────────────────────────────────────────────────
  const rememberTrending = (items) => {
    if (typeof window === 'undefined') return;
    const next = [
      ...items.map(i => String(i.productId || i.id)).filter(Boolean),
      ...trendingProductIds,
    ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 24);
    setTrendingProductIds(next);
    window.localStorage.setItem('cafeqr_recent_product_ids', JSON.stringify(next));
  };

  const buildCustomerSelections = () => {
    const selections = [];
    const seen       = new Set();
    const add = (c) => {
      if (!c) return;
      const name  = String(c.name || '').trim();
      const phone = String(c.phone || '').trim();
      const id    = c.id || null;
      if (!id && !name && !phone) return;
      const key = id ? `id:${id}` : phone ? `phone:${phone}` : `name:${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      selections.push({ id, name: name || null, phone: phone || null });
    };
    if (config?.allowMultipleCustomersPerOrder) {
      selectedCustomers.forEach(add);
      add({ name: customerName, phone: customerPhone });
    } else if (selectedCustomerId) {
      add({ id: selectedCustomerId, name: customerName, phone: customerPhone });
    } else {
      add({ name: customerName, phone: customerPhone });
    }
    return selections;
  };

  const handlePlaceOrder = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const saveCustomer = async (name, phone) => {
        const { data } = await api.post('/api/v1/purchasing/customers', {
          name: name.trim(), phone: phone ? phone.trim() : null, pricelistId: defaultPricelistId, isactive: 'Y'
        });
        return data.data;
      };

      let primaryCustomer  = null;
      let customerSels     = [];

      if (isCreditSale && selectedCreditCustomer) {
        primaryCustomer = { id: selectedCreditCustomer.linkedCustomerId || null, name: selectedCreditCustomer.name || null, phone: selectedCreditCustomer.phone || null };
        customerSels    = [primaryCustomer];
      } else if (config?.allowMultipleCustomersPerOrder) {
        const resolved = [];
        for (const c of selectedCustomers) {
          if (String(c.id).startsWith('temp-')) { const saved = await saveCustomer(c.name, c.phone); resolved.push({ id: saved.id, name: saved.name, phone: saved.phone }); }
          else resolved.push({ id: c.id, name: c.name, phone: c.phone });
        }
        if (customerName.trim()) { const saved = await saveCustomer(customerName, customerPhone); resolved.push({ id: saved.id, name: saved.name, phone: saved.phone }); }
        customerSels   = resolved;
        primaryCustomer = resolved[0] || null;
      } else {
        if (selectedCustomerId && String(selectedCustomerId).startsWith('temp-')) {
          const saved = await saveCustomer(customerName, customerPhone);
          primaryCustomer = { id: saved.id, name: saved.name, phone: saved.phone };
          customerSels    = [primaryCustomer];
        } else if (selectedCustomerId) {
          primaryCustomer = { id: selectedCustomerId, name: customerName, phone: customerPhone };
          customerSels    = [primaryCustomer];
        } else if (customerName.trim()) {
          const saved = await saveCustomer(customerName, customerPhone);
          primaryCustomer = { id: saved.id, name: saved.name, phone: saved.phone };
          customerSels    = [primaryCustomer];
        }
      }

      const processedLines = (totals.processed_items || []).map((pi, idx) => {
        const cartItem  = cart[idx] || null;
        const unitPrice = Number(pi.unit_price ?? pi.price ?? cartItem?.price ?? 0);
        const productName = pi.item_name || pi.name || cartItem?.displayName || cartItem?.name || 'Item';
        return {
          productId:      cartItem?.productId || pi.productId || pi.product_id || pi.id || null,
          variantId:      cartItem?.variantId || null,
          productName,
          categoryName:   cartItem?.categoryName || null,
          isPackagedGood: Boolean(cartItem?.isPackagedGood ?? cartItem?.is_packaged_good ?? cartItem?.is_packaged ?? pi.isPackagedGood ?? pi.is_packaged_good),
          quantity:       pi.quantity,
          unitPrice:      Number(unitPrice.toFixed(2)),
          unitOfMeasure:  cartItem?.uomName || 'units',
          taxRate:        Number(Number(pi.tax_rate || 0).toFixed(2)),
          taxAmount:      Number(Number(pi.tax_amount || 0).toFixed(2)),
          discountAmount: Number(Number(pi.discount_amount || 0).toFixed(2)),
          lineTotal:      Number(Number(pi.line_total || (unitPrice * Number(pi.quantity || 1))).toFixed(2)),
        };
      });

      const knownOffline    = isKnownOffline();
      const mainOfflineDev  = isMainOfflineBillingDevice();
      if (isCreditSale && knownOffline) throw new Error('Credit orders are online-only.');
      if (isCreditSale && !selectedCreditCustomerId) throw new Error('Choose a credit customer first.');

      const isCreditFinal  = isCreditSale && orderMode === 'settle';
      const isOfflineFinal = knownOffline && orderMode === 'settle' && mainOfflineDev;

      let parsedDate = null;
      try { if (orderDateTime) parsedDate = new Date(orderDateTime).toISOString(); } catch { /* ignore */ }

      const payload = {
        orderType:     'SALE',
        ...(orgId ? { orgId } : {}),
        orderSource:   knownOffline ? 'OFFLINE' : 'ONLINE',
        ...(parsedDate ? { orderDate: parsedDate } : {}),
        fulfillmentType: (initialTable && initialTable.tableNumber !== 'COUNTER')
          ? 'DINE_IN'
          : (initialTable?.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY'),
        tableNumber:    (initialTable && initialTable.tableNumber !== 'COUNTER') ? initialTable.tableNumber : null,
        tableId:        (initialTable && initialTable.tableNumber !== 'COUNTER') ? initialTable.id : null,
        orderStatus:    orderMode === 'kitchen' ? 'KITCHEN' : (isCreditFinal ? 'COMPLETED' : (isOfflineFinal ? 'COMPLETED' : 'BILLED')),
        paymentStatus:  orderMode === 'kitchen' ? 'PENDING' : (isCreditFinal ? 'PENDING' : (isOfflineFinal ? 'PAID' : 'PENDING')),
        ...(isCreditFinal ? { reference: 'CREDIT' } : (isOfflineFinal ? { reference: 'CASH' } : {})),
        isCredit:       isCreditFinal,
        creditCustomerId: isCreditSale ? selectedCreditCustomerId || null : null,
        customerId:     primaryCustomer?.id || null,
        customerIds:    customerSels.length > 0 ? customerSels : null,
        grandTotal:     Number(totals.total_amount.toFixed(2)),
        totalTaxAmount: Number(totals.total_tax.toFixed(2)),
        totalDiscountAmount: Number(Number(totals.discount_amount || 0).toFixed(2)),
        totalAmount:    Number(totals.total_inc_tax.toFixed(2)),
        lines:          processedLines,
      };

      if (knownOffline && orderMode === 'settle' && !mainOfflineDev)
        throw new Error('Final offline billing is only available on the main billing device.');

      if (knownOffline && mainOfflineDev) {
        await ensureOfflineSequenceLeases().catch(() => null);
        payload.syncOrigin      = 'MAIN_OFFLINE';
        payload.sourceLocalRef  = `LOCAL-${Date.now()}`;
        payload.orderNo         = allocateOfflineSequence('SALE_ORDER');
        if (orderMode === 'settle') {
          payload.offlineInvoiceNo = allocateOfflineSequence('CUSTOMER_INVOICE');
          payload.offlinePaymentNo = allocateOfflineSequence('INBOUND_PAYMENT');
        }
      }

      const res = await api.post('/api/v1/orders', payload, {
        skipOfflineQueue: knownOffline && orderMode === 'settle' && !mainOfflineDev,
      });

      if (res.data.success) {
        const offlineAccepted = Boolean(res.offline || res.data.offline || res.data.data?.offline);
        const savedOrder  = res.data.data || {};
        const savedLines  = Array.isArray(savedOrder?.lines) && savedOrder.lines.length ? savedOrder.lines : processedLines;
        const fallbackId  = savedOrder?.id || savedOrder?.offlineOperationId || `offline-${Date.now()}`;
        const printOrder  = {
          ...payload,
          ...savedOrder,
          id: fallbackId,
          orderNo: savedOrder?.orderNo || payload.orderNo || `OFFLINE-${String(fallbackId).replace(/[^a-zA-Z0-9]/g,'').slice(-8).toUpperCase()}`,
          invoiceNo: savedOrder?.invoiceNo,
          paymentNo: savedOrder?.paymentNo,
          createdAt:  savedOrder?.createdAt  || new Date().toISOString(),
          updatedAt:  savedOrder?.updatedAt  || new Date().toISOString(),
          lines:  savedLines,
          items:  processedLines,
          pricesIncludeTax: config?.pricesIncludeTax,
          offline: offlineAccepted,
          offlineOperationId: savedOrder?.offlineOperationId,
          syncStatus: offlineAccepted ? 'QUEUED' : savedOrder?.syncStatus,
        };
        const kind = orderMode === 'kitchen' ? 'kot' : (isCreditFinal || isOfflineFinal ? 'bill' : 'settle');
        onOrderCreated?.(printOrder, kind);
        rememberTrending(cart);
        if (kind !== 'settle') {
          setCart([]);
          if (onBack) onBack();
        }
      }
    } catch (e) {
      if (e?.code === 'OFFLINE_CACHE_MISS') {
        alert('Offline POS data is not prepared. Open POS once while online first.');
      } else {
        alert('Failed to place order: ' + (e.response?.data?.message || e.message));
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return null;

  // ── Customer selection panel ───────────────────────────────────────────────
  const renderCustomerPanel = () => {
    const showCredit = config?.creditEnabled && isCreditSale;
    return (
      <CustomerPanel>
        {showCredit ? (
          <div>
            <CustomerLabel>Credit Customer</CustomerLabel>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <CustomerInputWrap style={{ flex: 1 }}>
                <FaBook color="#14b8a6" size={11} />
                <CreditSelectWrap>
                  <NiceSelect
                    value={selectedCreditCustomerId}
                    onChange={setSelectedCreditCustomerId}
                    placeholder="Credit customer..."
                    options={creditCustomerOptions}
                    maxHeight={280}
                    style={{ height: 28, minWidth: 0, fontSize: '11px' }}
                  />
                </CreditSelectWrap>
              </CustomerInputWrap>
              <CreditNewBtn type="button" onClick={() => setShowNewCreditCustomer(true)}>
                <FaPlus size={8} /> New
              </CreditNewBtn>
            </div>
            <CreditMeta $warn={Boolean(creditLimitWarning)}>
              {creditLimitWarning || (selectedCreditCustomer
                ? `Balance ₹${Number(selectedCreditCustomer.balance || 0).toFixed(2)}`
                : 'Choose a credit customer before submitting.')}
            </CreditMeta>
          </div>
        ) : (
          <div ref={customerInputRef} style={{ position: 'relative' }}>
            <CustomerLabel>Customer Details</CustomerLabel>
            {!config?.allowMultipleCustomersPerOrder && selectedCustomerId ? (
              <CustomerChip>
                <span>{customerName}{customerPhone ? ` (${customerPhone})` : ''}</span>
                <button
                  type="button"
                  onClick={() => removeCustomer(selectedCustomerId)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center' }}
                >
                  <FaTimes size={9} />
                </button>
              </CustomerChip>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <CustomerInputWrap>
                  <FaUsers color="#94a3b8" size={11} />
                  <CustomerInput
                    placeholder="Customer Name"
                    value={customerName}
                    onChange={e => { setCustomerName(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onKeyDown={e => { if (e.key === 'Enter') setShowCustomerDropdown(false); }}
                  />
                </CustomerInputWrap>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <CustomerInputWrap style={{ flex: 1 }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>📞</span>
                    <CustomerInput
                      placeholder="Phone (Optional)"
                      value={customerPhone}
                      onChange={e => { setCustomerPhone(e.target.value); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onKeyDown={e => { if (e.key === 'Enter') setShowCustomerDropdown(false); }}
                    />
                  </CustomerInputWrap>
                  {config?.customerAgeEnabled && (
                    <CustomerInputWrap style={{ width: '55px' }}>
                      <CustomerInput
                        placeholder="Age"
                        value={customerAge}
                        onChange={e => setCustomerAge(e.target.value)}
                        type="number"
                        style={{ textAlign: 'center' }}
                      />
                    </CustomerInputWrap>
                  )}
                </div>
              </div>
            )}

            {showCustomerDropdown && (customerName || customerPhone) && filteredCustomers.length > 0 && (
              <CustomerDropdown>
                {filteredCustomers.map(c => (
                  <CustomerOption key={c.id} onClick={() => selectCustomer(c)}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{c.phone || 'No phone'}</span>
                  </CustomerOption>
                ))}
              </CustomerDropdown>
            )}

            {config?.allowMultipleCustomersPerOrder && selectedCustomers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                {selectedCustomers.map(c => (
                  <CustomerChip key={c.id} style={{ fontSize: '11px', padding: '3px 8px' }}>
                    {c.name}
                    <button type="button" onClick={() => removeCustomer(c.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center' }}>
                      <FaTimes size={8} />
                    </button>
                  </CustomerChip>
                ))}
              </div>
            )}
          </div>
        )}
      </CustomerPanel>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Wrapper onClick={onBack}>
      <Shell onClick={e => e.stopPropagation()}>

        {/* ── Top Header ── */}
        <TopBar>
          <HeaderLeft>
            <BackBtn onClick={onBack}><FaArrowLeft /></BackBtn>
            <AccentTitle $color={THEME.main}>
              <PageTitle>
                {initialTable
                  ? (initialTable.tableNumber === 'COUNTER'
                      ? (initialTable.orderType === 'DELIVERY' ? 'Delivery Order' : 'Takeaway Order')
                      : `Table ${initialTable.tableNumber}`)
                  : 'Sale Order'}
              </PageTitle>
            </AccentTitle>
          </HeaderLeft>

          <ModeSwitch>
            <ModeBtn $active={orderMode === 'kitchen'} $color="#f97316" onClick={() => setOrderMode('kitchen')}>Kitchen</ModeBtn>
            <ModeBtn $active={orderMode === 'settle'}  $color="#16a34a" onClick={() => setOrderMode('settle')}>Settle</ModeBtn>
          </ModeSwitch>

          <HeaderBtn type="button" onClick={() => router.push('/owner/orders?tab=completed')}>
            <FaHistory size={11} /> <span>Sales History</span>
          </HeaderBtn>

          <DateRow onClick={e => e.stopPropagation()}>
            <PremiumDateTimePicker
              value={orderDateTime}
              onChange={val => setOrderDateTime(val)}
              themeColor={THEME.main}
            />
          </DateRow>

          {config?.creditEnabled && (
            <CreditToggleBtn type="button" $active={isCreditSale} onClick={toggleCreditSale}>
              <FaBook size={11} /> Credit Sale
            </CreditToggleBtn>
          )}
        </TopBar>

        {/* ── Main body ── */}
        <MainLayout>
          {loadError ? (
            <OfflineBox style={{ margin: '40px auto' }}>{loadError}</OfflineBox>
          ) : (
            <>
              {/* LEFT: search + results */}
              <LeftPanel>
                <SearchWrap>
                  <SearchIcon><FaSearch /></SearchIcon>
                  <SearchInput
                    ref={searchRef}
                    placeholder="Search or scan product name..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    $color={THEME.main}
                    autoFocus
                  />
                </SearchWrap>

                {searchMatches.length > 0 ? (
                  <ResultsGrid>
                    {searchMatches.map(p => {
                      const hasOptions = hasExtendedOptions(p);
                      const qty        = productCartQuantity(p);
                      const nonVeg     = isNonVeg(p);
                      return (
                        <ProductCard
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          $color={THEME.main}
                          $inCart={qty > 0}
                          onClick={() => addFromSearch(p)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addFromSearch(p); } }}
                        >
                          <ProductMeta>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DietDot $nonVeg={nonVeg} />
                              <strong>{p.name}</strong>
                            </div>
                            <span>
                              {p.categoryName || 'Menu item'} {' • '}
                              {hasOptions ? 'Options available' : `₹${Number(p.price || 0).toFixed(2)}`}
                            </span>
                          </ProductMeta>

                          {hasOptions ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {qty > 0 && <VariantBadge $color={THEME.main}>{qty}</VariantBadge>}
                              <AddIcon $color={THEME.main}><FaChevronRight size={12} /></AddIcon>
                            </div>
                          ) : qty > 0 ? (
                            <InlineStepperWrap $color={THEME.main} onClick={e => e.stopPropagation()}>
                              <StepBtn type="button" $color={THEME.main} onClick={e => decrementProduct(e, p)}><FaMinus /></StepBtn>
                              <StepVal>{qty}</StepVal>
                              <StepBtn type="button" $color={THEME.main} onClick={e => incrementProduct(e, p)}><FaPlus /></StepBtn>
                            </InlineStepperWrap>
                          ) : (
                            <AddIcon $color={THEME.main}><FaPlus size={13} /></AddIcon>
                          )}
                        </ProductCard>
                      );
                    })}
                  </ResultsGrid>
                ) : (
                  <SearchHintCard>
                    {search.trim()
                      ? `No matches for "${search}". Try a different spelling.`
                      : <>
                          <FaSearch style={{ fontSize: 24, opacity: 0.2, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                          Type a product name above to search and add items to the order.
                        </>
                    }
                  </SearchHintCard>
                )}
              </LeftPanel>

              {/* RIGHT: cart + totals */}
              <RightPanel>
                <RightHeader>
                  <RightTitle>Current Order</RightTitle>
                  <CartCount $color={THEME.main}>
                    {cartItemCount} item{cartItemCount !== 1 ? 's' : ''}
                  </CartCount>
                </RightHeader>

                {renderCustomerPanel()}

                <CartBody>
                  {cart.length === 0 ? (
                    <EmptyCart>
                      <FaUtensils size={36} style={{ opacity: 0.15 }} />
                      <div>
                        <div style={{ fontWeight: 800, color: '#475569', fontSize: '15px' }}>Cart is empty</div>
                        <div style={{ fontSize: '12px', marginTop: '4px' }}>Search and add items from the left</div>
                      </div>
                    </EmptyCart>
                  ) : (
                    cart.map(item => (
                      <CartRow key={cartKeyFor(item)}>
                        <CartRowTop>
                          <CartRowName>{item.displayName || item.name}</CartRowName>
                          <QtyGroup>
                            <QtyBtn onClick={() => updateQty(cartKeyFor(item), -1)}><FaMinus /></QtyBtn>
                            <div style={{ fontWeight: 800, minWidth: 16, textAlign: 'center', fontSize: '11px', color: '#0f172a' }}>{item.qty}</div>
                            <QtyBtn onClick={() => updateQty(cartKeyFor(item), 1)}><FaPlus /></QtyBtn>
                          </QtyGroup>
                        </CartRowTop>
                        <CartRowBottom>
                          <CartRowPrice>
                            ₹{Number(item.price || 0).toFixed(2)} each
                            {((item.discount_percent > 0) || (item.discount_amount > 0)) && (
                              <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '5px', fontSize: '9.5px' }}>
                                (-{item.discount_percent > 0 ? `${item.discount_percent}%` : `₹${item.discount_amount}`})
                              </span>
                            )}
                          </CartRowPrice>
                          <CartRowTotal $color={THEME.main}>
                            ₹{(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)}
                          </CartRowTotal>
                        </CartRowBottom>
                      </CartRow>
                    ))
                  )}
                </CartBody>

                <CartFooter>
                  <TotalsBox>
                    <TotalRow><span>Subtotal</span><span>₹{totals.line_subtotal?.toFixed(2)}</span></TotalRow>
                    {totals.discount_amount > 0 && (
                      <TotalRow style={{ color: '#dc2626' }}><span>Discount</span><span>-₹{totals.discount_amount.toFixed(2)}</span></TotalRow>
                    )}
                    {config?.taxEnabled && (
                      <TotalRow><span>Taxable Value</span><span>₹{totals.taxable_amount?.toFixed(2)}</span></TotalRow>
                    )}
                    {totals.total_tax_added > 0 && (
                      <TotalRow><span>Tax (Excl.)</span><span>₹{totals.total_tax_added.toFixed(2)}</span></TotalRow>
                    )}
                    {totals.total_tax_included > 0 && (
                      <TotalRow style={{ color: '#94a3b8' }}><span>Tax (Incl. – info only)</span><span>₹{totals.total_tax_included.toFixed(2)}</span></TotalRow>
                    )}
                    {totals.round_off_amount !== 0 && (
                      <TotalRow><span>Round Off</span><span>{totals.round_off_amount > 0 ? '+' : ''}₹{totals.round_off_amount.toFixed(2)}</span></TotalRow>
                    )}
                    <TotalDivider />
                    <TotalRow $bold><span>Total</span><span style={{ color: THEME.main }}>₹{totals.total_amount?.toFixed(2)}</span></TotalRow>
                  </TotalsBox>

                  {orderMode === 'settle' && (
                    <DiscBtn type="button" onClick={() => setShowDiscountModal(true)}>
                      {totals.discount_amount > 0
                        ? `Edit Discounts (₹${totals.discount_amount.toFixed(2)})`
                        : 'Apply Discount'}
                    </DiscBtn>
                  )}

                  <PayBtn
                    $color={THEME.main}
                    $dark={THEME.dark}
                    disabled={cart.length === 0 || processing}
                    onClick={handlePlaceOrder}
                  >
                    {processing ? 'Processing...' : (
                      <>
                        {orderMode === 'kitchen' ? <FaFire /> : isCreditSale ? <FaBook /> : <FaWallet />}
                        {orderMode === 'kitchen'
                          ? (isCreditSale ? 'Send Credit to Kitchen' : 'Send to Kitchen')
                          : (isCreditSale ? 'Complete Credit' : 'Complete Sale')}
                      </>
                    )}
                  </PayBtn>
                </CartFooter>
              </RightPanel>
            </>
          )}
        </MainLayout>

        {/* ── Modals ── */}
        <CreditCustomerQuickCreateModal
          open={showNewCreditCustomer}
          themeColor="#14b8a6"
          onClose={() => setShowNewCreditCustomer(false)}
          onCreated={handleCreditCustomerCreated}
        />

        {variantLoading && (
          <OfflineBox style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
            Loading item options...
          </OfflineBox>
        )}

        {variantProduct && (
          <VariantSelector
            product={variantProduct}
            onClose={() => setVariantProduct(null)}
            onSelect={addVariantToCart}
            quantityMode
            initialQuantities={currentVariantQuantities}
            onSelectMany={syncVariantCart}
            themeColor={THEME.main}
            themeSoftColor={THEME.soft}
            themeDarkColor={THEME.dark}
          />
        )}

        {showDiscountModal && (
          <ModalBackdrop onClick={() => setShowDiscountModal(false)}>
            <DiscountModal onClick={e => e.stopPropagation()}>
              <DModalHead>
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(false)}
                  style={{ border: 'none', background: '#f1f5f9', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                >
                  <FaTimes size={10} />
                </button>
              </DModalHead>
              <DModalTabBar>
                <DModalTab type="button" $active={discountModalTab === 'line'}  $color={THEME.main} onClick={() => setDiscountModalTab('line')}>Line Discounts</DModalTab>
                <DModalTab type="button" $active={discountModalTab === 'total'} $color={THEME.main} onClick={() => setDiscountModalTab('total')}>Total Discount</DModalTab>
              </DModalTabBar>
              <DModalBody>
                {discountModalTab === 'line' ? (
                  cart.length === 0
                    ? <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Add items first to apply discounts.</div>
                    : cart.map(item => {
                        const key  = cartKeyFor(item);
                        const disc = localDiscounts[key] || { type: 'amount', value: 0 };
                        return (
                          <DiscRow key={key}>
                            <DiscRowInfo>
                              <span>{item.displayName || item.name}</span>
                              <small>₹{Number(item.price || 0).toFixed(2)} × {item.qty}</small>
                            </DiscRowInfo>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DiscInputWrap $color={THEME.main}>
                                <input
                                  type="number" min="0"
                                  max={disc.type === 'percentage' ? 100 : undefined}
                                  value={disc.value || ''}
                                  onChange={e => setLocalDiscounts(prev => ({ ...prev, [key]: { ...prev[key], value: parseFloat(e.target.value) || 0 } }))}
                                  style={{ border: 'none', outline: 'none', width: 60, padding: '0 4px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#000' }}
                                />
                              </DiscInputWrap>
                              <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6 }}>
                                <DiscUnitBtn type="button" $active={disc.type === 'amount'}      $color={THEME.main} onClick={() => setLocalDiscounts(prev => ({ ...prev, [key]: { ...prev[key], type: 'amount' } }))}>₹</DiscUnitBtn>
                                <DiscUnitBtn type="button" $active={disc.type === 'percentage'}  $color={THEME.main} onClick={() => setLocalDiscounts(prev => ({ ...prev, [key]: { ...prev[key], type: 'percentage' } }))}>%</DiscUnitBtn>
                              </div>
                            </div>
                          </DiscRow>
                        );
                      })
                ) : (
                  <div style={{ padding: '12px 0' }}>
                    <DiscRow style={{ justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, fontSize: 13.5, color: '#1e293b' }}>Total Discount</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <DiscInputWrap $color={THEME.main}>
                          <input
                            type="number" min="0"
                            max={localOrderDiscountType === 'percentage' ? 100 : undefined}
                            value={localOrderDiscountValue || ''}
                            onChange={e => setLocalOrderDiscountValue(parseFloat(e.target.value) || 0)}
                            style={{ border: 'none', outline: 'none', width: 60, padding: '0 4px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#000', background: 'transparent' }}
                          />
                        </DiscInputWrap>
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6 }}>
                          <DiscUnitBtn type="button" $active={localOrderDiscountType === 'amount'}      $color={THEME.main} onClick={() => setLocalOrderDiscountType('amount')}>₹</DiscUnitBtn>
                          <DiscUnitBtn type="button" $active={localOrderDiscountType === 'percentage'}  $color={THEME.main} onClick={() => setLocalOrderDiscountType('percentage')}>%</DiscUnitBtn>
                        </div>
                      </div>
                    </DiscRow>
                  </div>
                )}
              </DModalBody>
              <DModalFoot>
                <button type="button" onClick={handleClearAllDiscounts} style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontWeight: 700, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Clear All</button>
                <button type="button" onClick={handleApplyDiscounts}    style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', background: THEME.main, fontWeight: 700, fontSize: 13, color: 'white', cursor: 'pointer' }}>Apply</button>
              </DModalFoot>
            </DiscountModal>
          </ModalBackdrop>
        )}

      </Shell>
    </Wrapper>
  );
}
