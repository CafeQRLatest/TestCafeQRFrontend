import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import api from '../utils/api';
import { 
  FaPlus, FaMinus, FaSearch, FaUtensils, 
  FaWallet, FaFire, FaArrowLeft, FaLeaf, FaChevronRight, FaImage, FaTimes, FaShoppingBag, FaUsers
} from 'react-icons/fa';
import { calculateOrderTotals } from '../utils/orderCalculations';
import { isKnownOffline } from '../utils/networkState';
import { allocateOfflineSequence, ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../utils/offlineSequences';
import VariantSelector from './VariantSelector';

// Ported Styled Components from legacy counter.js & PremiumPOSUI
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  @media (max-width: 640px) {
    padding: 0;
  }
`;

const ModalContent = styled.div`
  background: #f8fafc;
  width: 100%;
  max-width: 1500px;
  height: min(95dvh, 980px);
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${fadeIn} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;

  @media (max-width: 900px) {
    height: calc(100dvh - 24px);
    border-radius: 24px;
  }

  @media (max-width: 640px) {
    height: 100dvh;
    border-radius: 0;
  }
`;

const CounterHeader = styled.header`
  padding: 20px 32px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;

  @media (max-width: 720px) {
    padding: 16px;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;

  @media (max-width: 520px) {
    gap: 12px;
  }
`;

const BackBtn = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 14px;
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

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  overflow-wrap: anywhere;

  @media (max-width: 520px) {
    font-size: 21px;
  }
`;

const Subtitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
`;

const MainLayout = styled.main`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;

  @media (max-width: 900px) {
    display: block;
    overflow-y: auto;
  }
`;

const CatalogSection = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  gap: 24px;
  min-width: 0;

  @media (max-width: 900px) {
    min-height: 100%;
    overflow: visible;
    padding: 18px 18px 96px;
    gap: 16px;
  }

  @media (max-width: 520px) {
    padding: 14px 12px 96px;
  }
`;

const CartSection = styled.aside`
  width: clamp(360px, 30vw, 460px);
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0,0,0,0.02);
  min-height: 0;

  @media (max-width: 900px) {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-height: min(76dvh, 640px);
    border-left: 0;
    border-top: 1px solid #e2e8f0;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -24px 50px rgba(15, 23, 42, 0.24);
    transform: translateY(${props => props.$mobileOpen ? '0' : '110%'});
    transition: transform 0.25s ease;
    z-index: 60;
  }
`;

const HeaderModeSwitch = styled.div`
  display: flex;
  gap: 12px;
  background: #f1f5f9;
  padding: 6px;
  border-radius: 16px;

  @media (max-width: 520px) {
    width: 100%;
    gap: 8px;

    button {
      flex: 1;
    }
  }
`;

const SearchBar = styled.div`
  position: relative;
  width: 100%;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 16px 20px 16px 56px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 20px;
  font-size: 16px;
  font-weight: 600;
  outline: none;
  transition: all 0.3s;
  &:focus { border-color: ${props => props.$themeColor || '#ea580c'}; box-shadow: 0 0 0 4px ${props => props.$themeColor}15; }

  @media (max-width: 520px) {
    padding: 14px 16px 14px 48px;
    border-radius: 16px;
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 20px;
`;

const CategoryScroll = styled.div`
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  &::-webkit-scrollbar { display: none; }
`;

const CatBtn = styled.button`
  padding: 12px 24px;
  border-radius: 99px;
  border: 1px solid ${props => props.$active ? props.$themeColor : '#e2e8f0'};
  background: ${props => props.$active ? props.$themeColor : 'white'};
  color: ${props => props.$active ? 'white' : '#64748b'};
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s;
  &:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
`;

const FilterTabs = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  &::-webkit-scrollbar { display: none; }
`;

const FilterBtn = styled.button`
  padding: 12px 20px;
  border-radius: 14px;
  border: 0;
  background: ${props => props.$active ? props.$themeColor : '#eef2f7'};
  color: ${props => props.$active ? 'white' : '#475569'};
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
`;

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  overflow-y: auto;
  padding-bottom: 20px;
  min-height: 0;

  @media (max-width: 1120px) {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }

  @media (max-width: 900px) {
    overflow: visible;
  }

  @media (max-width: 520px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }
`;

const StandardWorkspace = styled.div`
  flex: 1;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 20px;
  min-height: 0;
`;

const StandardSearchPanel = styled.div`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 22px;
  padding: 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
`;

const StandardResults = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 14px;
  max-height: 260px;
  overflow-y: auto;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
    max-height: none;
  }
`;

const StandardProductButton = styled.div`
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  transition: all 0.2s;
  min-width: 0;

  &:hover {
    border-color: ${props => props.$themeColor};
    box-shadow: 0 10px 20px ${props => props.$themeColor}18;
    transform: translateY(-1px);
  }

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const StandardProductMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong {
    color: #0f172a;
    font-size: 14px;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  span {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }
`;

const StandardAddIcon = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: ${props => props.$themeColor}15;
  color: ${props => props.$themeColor};
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
`;

const StandardCurrentOrder = styled.div`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 900px) {
    min-height: 360px;
  }
`;

const StandardOrderHeader = styled.div`
  padding: 18px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

const StandardOrderList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const StandardOrderRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 14px;
  align-items: center;
  padding: 14px;
  background: #f8fafc;
  border-radius: 16px;
  border: 1px solid #edf2f7;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const SearchHint = styled.div`
  margin-top: 14px;
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  padding: 24px;
  color: #64748b;
  font-weight: 700;
  text-align: center;
`;

const ProductCard = styled.div`
  background: white;
  border-radius: 24px;
  border: 2px solid ${props => props.$inCart ? props.$themeColor : '#f1f5f9'};
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  overflow: hidden;
  font: inherit;
  min-width: 0;
  &:hover { transform: translateY(-6px); box-shadow: 0 12px 24px -8px rgba(0,0,0,0.1); border-color: ${props => props.$themeColor}40; }

  @media (max-width: 640px) {
    border-radius: 18px;

    &:hover {
      transform: none;
    }
  }
`;

const ProdImg = styled.div`
  height: 140px;
  position: relative;
  background-size: cover;
  background-position: center;
  background-color: #eef2f7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  font-size: 34px;

  @media (max-width: 520px) {
    height: 112px;
  }
`;

const ProductBody = styled.div`
  padding: 16px;
  display: grid;
  gap: 10px;
  min-width: 0;

  @media (max-width: 520px) {
    padding: 12px;
  }
`;

const VegBadge = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 2px solid ${props => props.$nonVeg ? '#dc2626' : '#16a34a'};
  background: white;
  color: ${props => props.$nonVeg ? '#dc2626' : '#16a34a'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
`;

const CategoryTag = styled.span`
  width: fit-content;
  max-width: 100%;
  padding: 4px 9px;
  border-radius: 999px;
  background: #eef2f7;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProdName = styled.div`
  font-weight: 900;
  font-size: 16px;
  color: #0f172a;
  line-height: 1.4;
  height: 42px;
  overflow: hidden;
  overflow-wrap: anywhere;

  @media (max-width: 520px) {
    font-size: 14px;
    height: 40px;
  }
`;

const ProdPriceRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const ProdPrice = styled.div`
  font-weight: 800;
  font-size: 18px;
  color: ${props => props.$themeColor};
`;

const AddBtn = styled.div`
  min-height: 40px;
  border-radius: 14px;
  background: ${props => props.$outline ? 'white' : props.$themeColor};
  border: 1px solid ${props => props.$themeColor};
  color: ${props => props.$outline ? props.$themeColor : 'white'};
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 900;
  transition: all 0.2s;
  white-space: nowrap;

  @media (max-width: 520px) {
    width: 100%;
  }
`;

const ProductStepper = styled.div`
  min-height: 40px;
  min-width: 118px;
  border-radius: 14px;
  border: 1px solid ${props => props.$themeColor};
  background: white;
  color: #0f172a;
  display: grid;
  grid-template-columns: 38px 1fr 38px;
  overflow: hidden;

  @media (max-width: 520px) {
    width: 100%;
    min-width: 0;
  }
`;

const ProductQtyBtn = styled.button`
  border: 0;
  background: ${props => props.$themeColor}12;
  color: ${props => props.$themeColor};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const ProductQtyValue = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  border-left: 1px solid ${props => props.$themeColor}25;
  border-right: 1px solid ${props => props.$themeColor}25;
  font-weight: 900;
`;

const VariantCount = styled.span`
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  padding: 0 8px;
  background: ${props => props.$themeColor};
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
`;

const CartHeader = styled.div`
  padding: 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  @media (max-width: 900px) {
    padding: 18px 20px;
  }
`;

const CartBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  @media (max-width: 900px) {
    max-height: 38dvh;
  }
`;

const CartFooter = styled.div`
  padding: 24px;
  border-top: 1px solid #e2e8f0;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (max-width: 900px) {
    padding: 18px 20px;
  }
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-weight: ${props => props.$bold ? '800' : '600'};
  font-size: ${props => props.$bold ? '22px' : '14px'};
  color: ${props => props.$bold ? '#0f172a' : '#64748b'};
`;

const PayBtn = styled.button`
  width: 100%;
  padding: 20px;
  border-radius: 20px;
  background: linear-gradient(135deg, ${props => props.$color} 0%, ${props => props.$colorDark} 100%);
  color: white;
  font-size: 18px;
  font-weight: 800;
  border: none;
  cursor: pointer;
  box-shadow: 0 10px 25px -5px ${props => props.$color}40;
  transition: all 0.3s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  &:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px ${props => props.$color}60; }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
`;

const EmptyCart = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #94a3b8;
  padding: 40px;
  text-align: center;
`;

const CartItemCard = styled.div`
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid #f1f5f9;
  background: white;
`;

const CartItemInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const QtyGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
  padding: 4px 8px;
  border-radius: 10px;
  flex: 0 0 auto;
`;

const QtyBtn = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: white;
  color: #64748b;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const CartCloseBtn = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;

  @media (max-width: 900px) {
    display: inline-flex;
  }
`;

const MobileCartBackdrop = styled.div`
  display: none;

  @media (max-width: 900px) {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.38);
    z-index: 50;
  }
`;

const MobileCartToggle = styled.button`
  display: none;

  @media (max-width: 900px) {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    z-index: 45;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: min(360px, calc(100% - 28px));
    min-height: 56px;
    border: 0;
    border-radius: 999px;
    background: ${props => props.$themeColor};
    color: white;
    box-shadow: 0 18px 36px ${props => props.$themeColor}35;
    cursor: pointer;
    font-size: 15px;
    font-weight: 900;
  }
`;

const OfflineNotice = styled.div`
  margin: auto;
  max-width: 520px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  border-radius: 20px;
  padding: 24px;
  text-align: center;
  font-weight: 800;
  line-height: 1.6;
`;

const CustomerPickerArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 10;
  min-width: 250px;
`;

const CustomerInputWrap = styled.div`
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0 12px;
  height: 44px;
  gap: 8px;
  &:focus-within {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const CustomerInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  min-width: 100px;
  &::placeholder {
    color: #94a3b8;
    font-weight: 500;
  }
`;

const CustomerDropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  max-height: 250px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
`;

const CustomerOption = styled.button`
  text-align: left;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  &:hover {
    background: #f8fafc;
  }
`;

const CustomerName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
`;

const CustomerPhone = styled.span`
  font-size: 12px;
  color: #64748b;
`;

const CustomerChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const CustomerChip = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 600;
`;

const RemoveChip = styled.button`
  border: none;
  background: transparent;
  color: #3b82f6;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  &:hover { color: #1e3a8a; }
`;

export default function CounterSale({ onBack, initialTable, onOrderCreated, interfaceMode = 'counter' }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['ALL']);
  const [activeCat, setActiveCat] = useState('ALL');
  const [dietFilter, setDietFilter] = useState('ALL');
  const [trendingProductIds, setTrendingProductIds] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [orderMode, setOrderMode] = useState('settle'); // 'kitchen' | 'settle'
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState(null);
  const [variantProduct, setVariantProduct] = useState(null);
  const [variantLoading, setVariantLoading] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAge, setCustomerAge] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerInputRef = useRef(null);
  const searchRef = useRef(null);
  const isStandardUi = interfaceMode === 'standard';

  const THEME = orderMode === 'kitchen' 
    ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' } 
    : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3' };

  useEffect(() => {
    (async () => {
      try {
        const [pRes, cRes, custRes] = await Promise.all([
          api.get('/api/v1/products'),
          api.get('/api/v1/configurations'),
          api.get('/api/v1/purchasing/customers').catch(() => ({ data: { data: [] } }))
        ]);
        const pList = pRes.data.data || [];
        setProducts(pList);
        setConfig(cRes.data.data);
        if (custRes?.data?.data) {
          setAllCustomers(custRes.data.data);
        }
        const cats = ['ALL', ...new Set(pList.map(p => p.categoryName).filter(Boolean))];
        setCategories(cats);
      } catch (e) {
        if (e?.code === 'OFFLINE_CACHE_MISS') {
          setLoadError('Offline POS data is not prepared on this device yet. Connect once, open POS, and wait for offline setup to finish.');
        } else {
          console.error('Failed to load counter data', e);
          setLoadError('Failed to load POS data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(window.localStorage.getItem('cafeqr_recent_product_ids') || '[]');
      if (Array.isArray(stored)) {
        setTrendingProductIds(stored.map(String));
      }
    } catch {
      setTrendingProductIds([]);
    }
  }, []);

  const cartKeyFor = useCallback((item) => String(item.cartKey || `${item.productId || item.id}:${item.variantId || 'base'}`), []);

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [cart]
  );

  const cartCountLabel = `${cartItemCount} Item${cartItemCount === 1 ? '' : 's'}`;

  const hasVariantOptions = useCallback((product) => (
    Boolean(product?.hasVariants) || Number(product?.variantCount || 0) > 0
  ), []);

  const productCartLines = useCallback((product) => {
    const productId = String(product?.id || product?.productId || '');
    if (!productId) return [];
    return cart.filter((item) => String(item.productId || item.id) === productId);
  }, [cart]);

  const productCartQuantity = useCallback((product) => (
    productCartLines(product).reduce((sum, item) => sum + Number(item.qty || 0), 0)
  ), [productCartLines]);

  const baseProductCartLine = useCallback((product) => (
    productCartLines(product).find((item) => !item.variantId)
  ), [productCartLines]);

  const variantQuantityMap = useCallback((product) => (
    productCartLines(product).reduce((acc, item) => {
      if (item.variantId) {
        acc[String(item.variantId)] = Number(item.qty || 0);
      }
      return acc;
    }, {})
  ), [productCartLines]);

  const isNonVegProduct = useCallback((product) => {
    const type = String(product?.productType || product?.product_type || '').toUpperCase();
    return type.includes('NON') || type.includes('MEAT') || type.includes('CHICKEN') || type.includes('FISH');
  }, []);

  const isVegProduct = useCallback((product) => {
    const type = String(product?.productType || product?.product_type || '').toUpperCase();
    if (isNonVegProduct(product)) return false;
    return type.includes('VEG') || type.includes('VEGETARIAN');
  }, [isNonVegProduct]);

  const rememberTrending = (items) => {
    if (typeof window === 'undefined') return;
    const next = [
      ...items.map((item) => String(item.productId || item.id)).filter(Boolean),
      ...trendingProductIds,
    ].filter((value, index, list) => list.indexOf(value) === index).slice(0, 24);
    setTrendingProductIds(next);
    window.localStorage.setItem('cafeqr_recent_product_ids', JSON.stringify(next));
  };

  const addPreparedToCart = (product) => {
    setCart(prev => {
      const quantity = Math.max(1, Number(product.qty || 1));
      const prepared = {
        ...product,
        productId: product.productId || product.id,
        cartKey: cartKeyFor(product),
        displayName: product.displayName || product.name,
        qty: quantity,
      };
      const key = cartKeyFor(prepared);
      const exists = prev.find(item => cartKeyFor(item) === key);
      if (exists) return prev.map(item => cartKeyFor(item) === key ? { ...item, qty: Number(item.qty || 0) + quantity } : item);
      return [...prev, prepared];
    });
  };

  const openVariantSelector = async (product) => {
    setVariantLoading(true);
    try {
      const { data } = await api.get(`/api/v1/products/${product.id}`);
      setVariantProduct({
        ...product,
        ...(data.data || {}),
        categoryName: product.categoryName,
      });
    } catch (error) {
      console.error('Failed to load product variants', error);
      alert('Unable to load item options. Please try again.');
    } finally {
      setVariantLoading(false);
    }
  };

  const addToCart = async (p) => {
    if (hasVariantOptions(p)) {
      await openVariantSelector(p);
      return;
    }
    addPreparedToCart({ ...p, cartKey: `${p.id}:base`, productId: p.id, displayName: p.name });
  };

  const addVariantToCart = (variant) => {
    if (!variantProduct) return;
    const displayName = `${variantProduct.name} (${variant.label})`;
    addPreparedToCart({
      ...variantProduct,
      id: variantProduct.id,
      productId: variantProduct.id,
      variantId: variant.id,
      variantName: variant.label,
      name: displayName,
      displayName,
      price: variant.price,
      cartKey: `${variantProduct.id}:${variant.id}`,
    });
    setVariantProduct(null);
  };

  const syncVariantCart = (selectedVariants) => {
    if (!variantProduct) return;
    const productId = String(variantProduct.id);
    const nextVariantLines = (selectedVariants || [])
      .map((variant) => {
        const quantity = Math.max(0, Number(variant.quantity || 0));
        if (!quantity) return null;
        const displayName = `${variantProduct.name} (${variant.label})`;
        return {
          ...variantProduct,
          id: variantProduct.id,
          productId: variantProduct.id,
          variantId: variant.id,
          variantName: variant.label,
          name: displayName,
          displayName,
          price: variant.price,
          qty: quantity,
          cartKey: `${variantProduct.id}:${variant.id}`,
        };
      })
      .filter(Boolean);

    setCart(prev => [
      ...prev.filter(item => !(String(item.productId || item.id) === productId && item.variantId)),
      ...nextVariantLines,
    ]);
    setVariantProduct(null);
  };

  const updateQty = (key, delta) => {
    setCart(prev => prev.map(item => {
      if (cartKeyFor(item) === String(key)) return { ...item, qty: Math.max(0, Number(item.qty || 0) + delta) };
      return item;
    }).filter(item => item.qty > 0));
  };

  const decrementProduct = (event, product) => {
    event.stopPropagation();
    const line = baseProductCartLine(product);
    if (line) updateQty(cartKeyFor(line), -1);
  };

  const incrementProduct = (event, product) => {
    event.stopPropagation();
    addPreparedToCart({ ...product, cartKey: `${product.id}:base`, productId: product.id, displayName: product.name });
  };

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(p => {
      const matchesCategory = activeCat === 'ALL' || p.categoryName === activeCat;
      const matchesSearch = !term || String(p.name || '').toLowerCase().includes(term);
      const matchesDiet = dietFilter === 'VEG' ? isVegProduct(p) : true;
      const matchesTrending = dietFilter === 'TRENDING'
        ? (trendingProductIds.length ? trendingProductIds.includes(String(p.id)) : products.indexOf(p) < 12)
        : true;
      return matchesCategory && matchesSearch && matchesDiet && matchesTrending;
    });
  }, [activeCat, dietFilter, isVegProduct, products, search, trendingProductIds]);

  const standardMatches = useMemo(() => {
    const term = search.trim();
    if (!term) return [];
    const normalizedTerm = term.toLowerCase();
    return products
      .filter(p => String(p.name || '').toLowerCase().includes(normalizedTerm))
      .slice(0, 12);
  }, [products, search]);

  const addFromStandardSearch = async (product) => {
    await addToCart(product);
    setSearch('');
    searchRef.current?.focus();
  };

  const currentVariantQuantities = useMemo(
    () => variantProduct ? variantQuantityMap(variantProduct) : {},
    [variantProduct, variantQuantityMap]
  );

  useEffect(() => {
    if (cart.length === 0) {
      setMobileCartOpen(false);
    }
  }, [cart.length]);

  const totals = useMemo(() => {
    if (!config) return { subtotal: 0, tax: 0, total: 0 };
    return calculateOrderTotals(
      cart.map(i => ({
        ...i,
        id: cartKeyFor(i),
        productId: i.productId || i.id,
        name: i.displayName || i.name,
        quantity: i.qty,
        tax_rate: i.taxRate || 0,
        is_packaged_good: i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true,
        is_packaged: i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true
      })),
      { type: 'amount', value: 0 },
      { 
        gst_enabled: config.taxEnabled,
        default_tax_rate: 5,
        prices_include_tax: config.pricesIncludeTax,
        round_off_config: { round_off_enabled: config.roundOffEnabled }
      }
    );
  }, [cart, config, cartKeyFor]);

  const handlePlaceOrder = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const processedLines = (totals.processed_items || []).map((pi, idx) => {
        // processed_items are in the same order as cart — use index for reliable 1:1 mapping
        const cartItem = cart[idx] || null;
        const unitPrice = Number(pi.unit_price ?? pi.price ?? cartItem?.price ?? 0);
        const productName = pi.item_name || pi.name || cartItem?.displayName || cartItem?.name || 'Item';

        return {
          productId: cartItem?.productId || pi.productId || pi.product_id || pi.id || pi.pid || null,
          variantId: cartItem?.variantId || null,
          productName,
          categoryName: cartItem?.categoryName || pi.categoryName || pi.category || null,
          isPackagedGood: Boolean(cartItem?.isPackagedGood ?? cartItem?.is_packaged_good ?? cartItem?.is_packaged ?? pi.isPackagedGood ?? pi.is_packaged_good ?? pi.is_packaged),
          quantity: pi.quantity,
          unitPrice: Number(unitPrice.toFixed(2)),
          unitOfMeasure: cartItem?.uomName || cartItem?.unitOfMeasure || pi.unitOfMeasure || pi.unit_of_measure || 'units',
          taxRate: Number(Number(pi.tax_rate || 0).toFixed(2)),
          taxAmount: Number(Number(pi.tax_amount || 0).toFixed(2)),
          discountAmount: Number(Number(pi.discount_amount || 0).toFixed(2)),
          lineTotal: Number(Number(pi.line_total || (unitPrice * Number(pi.quantity || 1))).toFixed(2))
        };
      });

      const payload = {
        orderType: 'SALE',
        orderSource: 'ONLINE',
        fulfillmentType: initialTable ? 'DINE_IN' : 'TAKEAWAY', // Align with enum: DINE_IN, TAKEAWAY, DELIVERY
        tableNumber: initialTable ? initialTable.tableNumber : null,
        tableId: initialTable ? initialTable.id : null,
        orderStatus: orderMode === 'kitchen' ? 'KITCHEN' : 'COMPLETED',
        paymentStatus: orderMode === 'kitchen' ? 'PENDING' : 'PAID',
        reference: 'CASH', // Using reference as the payment method column
        customerId: selectedCustomerId,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        customerIds: selectedCustomers.length > 0 ? JSON.stringify(selectedCustomers) : null,
        grandTotal: Number(totals.total_amount.toFixed(2)),
        totalTaxAmount: Number(totals.total_tax.toFixed(2)),
        totalAmount: Number(totals.total_inc_tax.toFixed(2)),
        lines: processedLines
      };

      const knownOffline = isKnownOffline();
      const mainOfflineDevice = isMainOfflineBillingDevice();

      if (knownOffline) {
        payload.orderSource = 'OFFLINE';
      }

      if (knownOffline && orderMode === 'settle' && !mainOfflineDevice) {
        throw new Error('Final offline billing is available only on the main billing device. This device can create provisional kitchen orders while offline.');
      }

      if (knownOffline && mainOfflineDevice) {
        await ensureOfflineSequenceLeases().catch(() => null);
        payload.syncOrigin = 'MAIN_OFFLINE';
        payload.sourceLocalRef = `LOCAL-${Date.now()}`;
        payload.orderNo = allocateOfflineSequence('SALE_ORDER');
        if (orderMode === 'settle') {
          payload.offlineInvoiceNo = allocateOfflineSequence('CUSTOMER_INVOICE');
          payload.offlinePaymentNo = allocateOfflineSequence('INBOUND_PAYMENT');
        }
      }

      const res = await api.post('/api/v1/orders', payload, {
        skipOfflineQueue: knownOffline && orderMode === 'settle' && !mainOfflineDevice,
      });
      if (res.data.success) {
        const offlineAccepted = Boolean(res.offline || res.data.offline || res.data.data?.offline);
        const savedOrder = res.data.data || {};
        const savedLines = Array.isArray(savedOrder?.lines) && savedOrder.lines.length
          ? savedOrder.lines
          : processedLines;
        const fallbackId = savedOrder?.id || savedOrder?.offlineOperationId || `offline-${Date.now()}`;
        const printOrder = {
          ...payload,
          ...savedOrder,
          id: fallbackId,
          orderNo: savedOrder?.orderNo || payload.orderNo || `OFFLINE-${String(fallbackId).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`,
          invoiceNo: savedOrder?.invoiceNo,
          paymentNo: savedOrder?.paymentNo,
          createdAt: savedOrder?.createdAt || new Date().toISOString(),
          updatedAt: savedOrder?.updatedAt || new Date().toISOString(),
          lines: savedLines,
          items: processedLines,
          pricesIncludeTax: config?.pricesIncludeTax,
          offline: offlineAccepted,
          offlineOperationId: savedOrder?.offlineOperationId,
          syncStatus: offlineAccepted ? 'QUEUED' : savedOrder?.syncStatus,
        };

        onOrderCreated?.(printOrder, orderMode === 'kitchen' ? 'kot' : 'bill');
        rememberTrending(cart);
        setCart([]);
        if (onBack) onBack();
      }
    } catch (e) {
      if (e?.code === 'OFFLINE_CACHE_MISS') {
        alert('Offline POS data is not prepared on this device yet. Open POS once while online before using it offline.');
      } else {
        alert('Failed to place order: ' + (e.response?.data?.message || e.message));
      }
    } finally {
      setProcessing(false);
    }
  };
  const filteredCustomers = useMemo(() => {
    if (!customerPhone && !customerName) return [];
    const lowerName = customerName.toLowerCase();
    return allCustomers.filter(c => 
      (c.phone && c.phone.includes(customerPhone)) || 
      (c.name && c.name.toLowerCase().includes(lowerName))
    ).slice(0, 5);
  }, [allCustomers, customerName, customerPhone]);

  const selectCustomer = (cust) => {
    if (config?.allowMultipleCustomersPerOrder) {
      if (!selectedCustomers.find(c => c.id === cust.id)) {
        setSelectedCustomers([...selectedCustomers, cust]);
      }
      setCustomerPhone('');
      setCustomerName('');
    } else {
      setSelectedCustomerId(cust.id);
      setCustomerPhone(cust.phone || '');
      setCustomerName(cust.name || '');
    }
    setShowCustomerDropdown(false);
  };

  const removeCustomer = (id) => {
    if (id === selectedCustomerId) {
      setSelectedCustomerId(null);
      setCustomerName('');
      setCustomerPhone('');
    } else {
      setSelectedCustomers(selectedCustomers.filter(c => c.id !== id));
    }
  };

  const handleCustomerKeyDown = (e) => {
    if (e.key === 'Enter' && !showCustomerDropdown && customerPhone) {
      // Allow them to just hit enter to keep what they typed
      setShowCustomerDropdown(false);
    }
  };
  if (loading) return null;

  return (
    <ModalOverlay onClick={onBack}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <CounterHeader>
          <HeaderLeft>
            <BackBtn onClick={onBack}><FaArrowLeft/></BackBtn>
            <TitleGroup>
              <Title>{initialTable ? `Table ${initialTable.tableNumber}` : 'Counter Sale'}</Title>
              <Subtitle>{isStandardUi ? 'Standard UI' : 'Counter UI'} • {new Date().toLocaleTimeString()}</Subtitle>
            </TitleGroup>
          </HeaderLeft>

          <HeaderModeSwitch>
            <CatBtn 
              $active={orderMode === 'kitchen'} 
              $themeColor="#f97316" 
              onClick={() => setOrderMode('kitchen')}
              style={{ padding: '8px 20px', fontSize: '13px' }}
            >
              <FaFire style={{ marginRight: '8px' }}/> Kitchen
            </CatBtn>
            <CatBtn 
              $active={orderMode === 'settle'} 
              $themeColor="#16a34a" 
              onClick={() => setOrderMode('settle')}
              style={{ padding: '8px 20px', fontSize: '13px' }}
            >
              <FaWallet style={{ marginRight: '8px' }}/> Settle
            </CatBtn>
          </HeaderModeSwitch>
          
          {config?.customersEnabled && (
            <CustomerPickerArea ref={customerInputRef}>
              <CustomerInputWrap>
                <FaUsers color="#94a3b8" />
                {!config?.allowMultipleCustomersPerOrder && selectedCustomerId ? (
                  <CustomerChip>
                    {customerName} {customerPhone ? `(${customerPhone})` : ''}
                    <RemoveChip onClick={() => removeCustomer(selectedCustomerId)}><FaTimes/></RemoveChip>
                  </CustomerChip>
                ) : (
                  <>
                    <CustomerInput 
                      placeholder="Customer Name"
                      value={customerName}
                      onChange={e => {
                        setCustomerName(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onKeyDown={handleCustomerKeyDown}
                    />
                    <CustomerInput 
                      placeholder="Phone"
                      value={customerPhone}
                      onChange={e => {
                        setCustomerPhone(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onKeyDown={handleCustomerKeyDown}
                    />
                  </>
                )}
                {config?.customerAgeEnabled && (
                  <CustomerInput 
                    placeholder="Age"
                    value={customerAge}
                    onChange={e => setCustomerAge(e.target.value)}
                    style={{ maxWidth: '60px' }}
                    type="number"
                  />
                )}
              </CustomerInputWrap>
              
              {showCustomerDropdown && (customerName || customerPhone) && (
                <CustomerDropdown>
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map(c => (
                      <CustomerOption key={c.id} onClick={() => selectCustomer(c)}>
                        <CustomerName>{c.name}</CustomerName>
                        <CustomerPhone>{c.phone || 'No phone'}</CustomerPhone>
                      </CustomerOption>
                    ))
                  ) : (
                    <div style={{ padding: '8px 12px', fontSize: 13, color: '#64748b' }}>
                      New customer will be created
                    </div>
                  )}
                </CustomerDropdown>
              )}

              {config?.allowMultipleCustomersPerOrder && selectedCustomers.length > 0 && (
                <CustomerChips>
                  {selectedCustomers.map(c => (
                    <CustomerChip key={c.id}>
                      {c.name}
                      <RemoveChip onClick={() => removeCustomer(c.id)}><FaTimes/></RemoveChip>
                    </CustomerChip>
                  ))}
                </CustomerChips>
              )}
            </CustomerPickerArea>
          )}
        </CounterHeader>

        <MainLayout>
          {loadError ? (
            <OfflineNotice>{loadError}</OfflineNotice>
          ) : (
          <>
          <CatalogSection>
            <SearchBar>
              <SearchIcon><FaSearch/></SearchIcon>
              <SearchInput 
                ref={searchRef}
                placeholder="Search menu items..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                $themeColor={THEME.main}
              />
            </SearchBar>

            {isStandardUi ? (
              <StandardWorkspace>
                <StandardSearchPanel>
                  {standardMatches.length > 0 ? (
                    <StandardResults>
                      {standardMatches.map(p => {
                        const hasOptions = hasVariantOptions(p);
                        const quantity = productCartQuantity(p);
                        return (
                          <StandardProductButton
                            key={p.id}
                            role="button"
                            tabIndex={0}
                            $themeColor={THEME.main}
                            onClick={() => addFromStandardSearch(p)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                addFromStandardSearch(p);
                              }
                            }}
                          >
                            <StandardProductMeta>
                              <strong>{p.name}</strong>
                              <span>{p.categoryName || 'Menu item'} • {hasOptions ? 'Options available' : `₹${Number(p.price || 0).toFixed(2)}`}</span>
                            </StandardProductMeta>
                            {hasOptions ? (
                              <AddBtn $themeColor={THEME.main} $outline>
                                {quantity > 0 && <VariantCount $themeColor={THEME.main}>{quantity}</VariantCount>}
                                Options <FaChevronRight />
                              </AddBtn>
                            ) : quantity > 0 ? (
                              <ProductStepper
                                $themeColor={THEME.main}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <ProductQtyBtn type="button" $themeColor={THEME.main} onClick={(event) => decrementProduct(event, p)}>
                                  <FaMinus />
                                </ProductQtyBtn>
                                <ProductQtyValue $themeColor={THEME.main}>{quantity}</ProductQtyValue>
                                <ProductQtyBtn type="button" $themeColor={THEME.main} onClick={(event) => incrementProduct(event, p)}>
                                  <FaPlus />
                                </ProductQtyBtn>
                              </ProductStepper>
                            ) : (
                              <StandardAddIcon $themeColor={THEME.main}><FaPlus /></StandardAddIcon>
                            )}
                          </StandardProductButton>
                        );
                      })}
                    </StandardResults>
                  ) : (
                    <SearchHint>
                      {search.trim() ? 'No matching menu items found' : 'Search or scan an item name to add it to the order'}
                    </SearchHint>
                  )}
                </StandardSearchPanel>

                <StandardCurrentOrder>
                  <StandardOrderHeader>
                    <Title style={{ fontSize: '18px' }}>Current Order</Title>
                    <CatBtn $themeColor={THEME.main} onClick={() => searchRef.current?.focus()}>
                      <FaPlus style={{ marginRight: 8 }} /> Product
                    </CatBtn>
                  </StandardOrderHeader>
                  <StandardOrderList>
                    {cart.length === 0 ? (
                      <EmptyCart>
                        <FaUtensils size={44} style={{ opacity: 0.18 }} />
                        <div>
                          <div style={{ fontWeight: 800, color: '#475569', fontSize: '18px' }}>Cart is empty</div>
                          <div style={{ fontSize: '13px' }}>Type above to search and add items</div>
                        </div>
                      </EmptyCart>
                    ) : (
                      cart.map(item => (
                        <StandardOrderRow key={cartKeyFor(item)}>
                          <CartItemInfo>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>{item.displayName || item.name}</div>
                            <div style={{ color: '#64748b', fontWeight: 700 }}>₹{Number(item.price || 0).toFixed(2)} each</div>
                          </CartItemInfo>
                          <QtyGroup>
                            <QtyBtn onClick={() => updateQty(cartKeyFor(item), -1)}><FaMinus /></QtyBtn>
                            <div style={{ fontWeight: 800, minWidth: '20px', textAlign: 'center' }}>{item.qty}</div>
                            <QtyBtn onClick={() => updateQty(cartKeyFor(item), 1)}><FaPlus /></QtyBtn>
                          </QtyGroup>
                          <div style={{ color: THEME.main, fontWeight: 900 }}>₹{(Number(item.price || 0) * item.qty).toFixed(2)}</div>
                        </StandardOrderRow>
                      ))
                    )}
                  </StandardOrderList>
                </StandardCurrentOrder>
              </StandardWorkspace>
            ) : (
              <>
                <FilterTabs>
                  <FilterBtn $active={dietFilter === 'ALL'} $themeColor={THEME.main} onClick={() => setDietFilter('ALL')}>
                    All
                  </FilterBtn>
                  <FilterBtn $active={dietFilter === 'VEG'} $themeColor={THEME.main} onClick={() => setDietFilter('VEG')}>
                    Veg Only
                  </FilterBtn>
                  <FilterBtn $active={dietFilter === 'TRENDING'} $themeColor={THEME.main} onClick={() => setDietFilter('TRENDING')}>
                    Trending
                  </FilterBtn>
                </FilterTabs>
                <CategoryScroll>
                  {categories.map(c => (
                    <CatBtn 
                      key={c} 
                      $active={activeCat === c} 
                      $themeColor={THEME.main}
                      onClick={() => setActiveCat(c)}
                    >
                      {c === 'ALL' ? 'Everything' : c}
                    </CatBtn>
                  ))}
                </CategoryScroll>

                <ProductGrid>
                  {visibleProducts.map(p => {
                  const quantity = productCartQuantity(p);
                  const hasOptions = hasVariantOptions(p);
                  const nonVeg = isNonVegProduct(p);
                  return (
                    <ProductCard
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      $themeColor={THEME.main}
                      $inCart={quantity > 0}
                      onClick={() => addToCart(p)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          addToCart(p);
                        }
                      }}
                    >
                      <ProdImg style={p.imageUrl ? { backgroundImage: `url(${p.imageUrl})` } : undefined}>
                        {!p.imageUrl && <FaImage />}
                        <VegBadge $nonVeg={nonVeg}>{nonVeg ? <FaFire /> : <FaLeaf />}</VegBadge>
                      </ProdImg>
                      <ProductBody>
                        <ProdName>{p.name}</ProdName>
                        <CategoryTag>{p.categoryName || 'Menu item'}</CategoryTag>
                        <ProdPriceRow>
                          <ProdPrice $themeColor={THEME.main}>₹{Number(p.price || 0).toFixed(2)}{hasOptions ? '+' : ''}</ProdPrice>
                          {hasOptions ? (
                            <AddBtn $themeColor={THEME.main} $outline>
                              {quantity > 0 && <VariantCount $themeColor={THEME.main}>{quantity}</VariantCount>}
                              View Options <FaChevronRight />
                            </AddBtn>
                          ) : quantity > 0 ? (
                            <ProductStepper
                              $themeColor={THEME.main}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <ProductQtyBtn type="button" $themeColor={THEME.main} onClick={(event) => decrementProduct(event, p)}>
                                <FaMinus />
                              </ProductQtyBtn>
                              <ProductQtyValue $themeColor={THEME.main}>{quantity}</ProductQtyValue>
                              <ProductQtyBtn type="button" $themeColor={THEME.main} onClick={(event) => incrementProduct(event, p)}>
                                <FaPlus />
                              </ProductQtyBtn>
                            </ProductStepper>
                          ) : (
                            <AddBtn $themeColor={THEME.main}>
                              <FaPlus /> Add
                            </AddBtn>
                          )}
                        </ProdPriceRow>
                      </ProductBody>
                    </ProductCard>
                  );
                  })}
                </ProductGrid>
              </>
            )}
          </CatalogSection>

          {mobileCartOpen && <MobileCartBackdrop onClick={() => setMobileCartOpen(false)} />}
          <CartSection $mobileOpen={mobileCartOpen}>
            <CartHeader>
              <div>
                <Title style={{ fontSize: '18px' }}>Your Cart</Title>
                <Subtitle style={{ color: THEME.main, fontWeight: 800 }}>{cartCountLabel}</Subtitle>
              </div>
              <CartCloseBtn type="button" onClick={() => setMobileCartOpen(false)} aria-label="Close cart">
                <FaTimes />
              </CartCloseBtn>
            </CartHeader>

            <CartBody>
              {cart.length === 0 ? (
                <EmptyCart>
                  <FaUtensils size={48} style={{ opacity: 0.2 }}/>
                  <div>
                    <div style={{ fontWeight: 800, color: '#475569', fontSize: '18px' }}>Empty Cart</div>
                    <div style={{ fontSize: '13px' }}>Select items from the left to start</div>
                  </div>
                </EmptyCart>
              ) : (
                cart.map(item => (
                  <CartItemCard key={cartKeyFor(item)}>
                    <CartItemInfo>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>{item.displayName || item.name}</div>
                      <div style={{ color: THEME.main, fontWeight: 800 }}>₹{(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)}</div>
                    </CartItemInfo>
                    <QtyGroup>
                      <QtyBtn onClick={() => updateQty(cartKeyFor(item), -1)}><FaMinus/></QtyBtn>
                      <div style={{ fontWeight: 800, minWidth: '20px', textAlign: 'center' }}>{item.qty}</div>
                      <QtyBtn onClick={() => updateQty(cartKeyFor(item), 1)}><FaPlus/></QtyBtn>
                    </QtyGroup>
                  </CartItemCard>
                ))
              )}
            </CartBody>

            <CartFooter>
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <SummaryRow><span>Subtotal</span><span>₹{totals.line_subtotal.toFixed(2)}</span></SummaryRow>
                <SummaryRow><span>Tax</span><span>₹{totals.total_tax.toFixed(2)}</span></SummaryRow>
                <div style={{ height: '1px', background: '#e2e8f0', margin: '8px 0' }}/>
                <SummaryRow $bold><span>Total</span><span>₹{totals.total_amount.toFixed(2)}</span></SummaryRow>
              </div>

              <PayBtn 
                $color={THEME.main} 
                $colorDark={THEME.dark} 
                disabled={cart.length === 0 || processing}
                onClick={handlePlaceOrder}
              >
                {processing ? 'Processing...' : (
                  <>
                    {orderMode === 'kitchen' ? <FaFire/> : <FaWallet/>}
                    {orderMode === 'kitchen' ? 'Send to Kitchen' : 'Complete Sale'}
                  </>
                )}
              </PayBtn>
            </CartFooter>
          </CartSection>
          {cart.length > 0 && (
            <MobileCartToggle
              type="button"
              $themeColor={THEME.main}
              onClick={() => setMobileCartOpen(true)}
            >
              <FaShoppingBag /> View Cart <span>|</span> {cartCountLabel} <span>|</span> ₹{Number(totals.total_amount || 0).toFixed(2)}
            </MobileCartToggle>
          )}
          </>
          )}
        </MainLayout>
        {variantLoading && <OfflineNotice style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>Loading item options...</OfflineNotice>}
        {variantProduct && (
          <VariantSelector
            product={variantProduct}
            onClose={() => setVariantProduct(null)}
            onSelect={addVariantToCart}
            quantityMode
            initialQuantities={currentVariantQuantities}
            onSelectMany={syncVariantCart}
          />
        )}
      </ModalContent>
    </ModalOverlay>
  );
}
