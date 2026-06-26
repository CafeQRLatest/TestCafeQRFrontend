import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import styled, { keyframes } from 'styled-components';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { formatTzDate, businessTimeToUtc, getLocalISOString } from '../utils/timezoneUtils';
import { 
  FaPlus, FaMinus, FaSearch, FaUtensils, 
  FaWallet, FaFire, FaArrowLeft, FaLeaf, FaChevronRight, FaImage, FaTimes, FaShoppingBag, FaUsers, FaBook, FaTag,
  FaHistory, FaEdit, FaTh, FaList
} from 'react-icons/fa';
import { calculateOrderTotals } from '../utils/orderCalculations';
import { isKnownOffline } from '../utils/networkState';
import { allocateOfflineSequence, ensureOfflineSequenceLeases, isMainOfflineBillingDevice } from '../utils/offlineSequences';
import { isAndroidPrintStationEnabled } from '../utils/cloudPrintStation';
import { isNativePrintServicePaired } from '../utils/printServiceClient';
import { isCustomersModuleEnabled, isDiscountModuleEnabled, isKitchenModuleEnabled } from '../utils/moduleVisibility';
import VariantSelector from './VariantSelector';
import NiceSelect from './NiceSelect';
import CreditCustomerQuickCreateModal from './CreditCustomerQuickCreateModal';
import PremiumDateTimePicker from './PremiumDateTimePicker';
import ProductManagementPopup from './ProductManagementPopup';
import PaymentDialog from './PaymentDialog';

function localPrintWillHandleOrder(kind) {
  if (typeof window === 'undefined') return false;
  if (!['kot', 'bill'].includes(kind)) return false;
  return isAndroidPrintStationEnabled() || isNativePrintServicePaired();
}

// Ported Styled Components from legacy counter.js & PremiumPOSUI
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ModalOverlay = styled.div`
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
`;

const ModalContent = styled.div`
  background: #f8fafc;
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  border-radius: 0;
  border: none;
  border-left: 1px solid #e2e8f0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: none;
`;

const CounterHeader = styled.header`
  padding: 8px 24px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;

  @media (max-width: 720px) {
    padding: 6px 16px;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;

  @media (max-width: 520px) {
    gap: 8px;
  }
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

const TitleGroup = styled.div`
  display: flex;
  align-items: center;
  border-left: 5px solid ${props => props.$accentColor || '#16a34a'};
  border-radius: 3px;
  padding: 0 0 0 10px;
  min-width: 0;
  height: 24px;
`;

const Title = styled.h1`
  margin: 0;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.015em;
  line-height: 1;
  overflow-wrap: anywhere;

  @media (max-width: 520px) {
    font-size: 15px;
  }
`;

const Subtitle = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
`;

const withoutDiscounts = (item) => ({
  ...item,
  discount_percent: 0,
  discount_amount: 0,
  discount: null,
});

const MainLayout = styled.main`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  width: 100%;
  min-width: 0;

  @media (max-width: 1280px) {
    display: block;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
`;

const CatalogSection = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: clamp(16px, 1.6vw, 24px);
  gap: clamp(14px, 1.4vw, 22px);
  min-width: 0;
  min-height: 0;

  @media (max-width: 1280px) {
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
  width: clamp(300px, 24vw, 380px);
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0,0,0,0.02);
  min-height: 0;

  @media (max-width: 1280px) {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-height: min(82dvh, 680px);
    border-left: 0;
    border-top: 1px solid #e2e8f0;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -24px 50px rgba(15, 23, 42, 0.24);
    transform: translateY(${props => props.$mobileOpen ? '0' : '110%'});
    transition: transform 0.25s ease;
    z-index: 1010;
  }

  @media (max-width: 520px) {
    max-height: calc(82dvh - env(safe-area-inset-bottom, 0px));
    border-radius: 20px 20px 0 0;
  }
`;

const HeaderModeSwitch = styled.div`
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 9px;
  align-items: center;
  box-shadow: inset 0 1px 2.5px rgba(15, 23, 42, 0.08);
  border: 1.5px solid #edf2f7;

  @media (max-width: 520px) {
    width: 100%;
    gap: 2px;

    button {
      flex: 1;
    }
  }
`;

const ModeToggleBtn = styled.button`
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid ${props => {
    if (!props.$active) return 'transparent';
    if (props.$themeColor === '#f97316') return '#ea580c';
    if (props.$themeColor === '#16a34a') return '#15803d';
    return props.$themeColor || '#15803d';
  }};
  background: ${props => {
    if (!props.$active) return 'transparent';
    return props.$themeColor || '#16a34a';
  }};
  color: ${props => {
    if (!props.$active) return '#64748b';
    return 'white';
  }};
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
    background: ${props => {
      if (props.$active) {
        if (props.$themeColor === '#f97316') return '#ea580c';
        if (props.$themeColor === '#16a34a') return '#15803d';
        return props.$themeColor || '#15803d';
      }
      return 'rgba(15, 23, 42, 0.04)';
    }};
  }
`;

const HeaderShortcutBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, ${props => props.$themeColor || '#f97316'} 0%, ${props => props.$themeColorDark || '#ea580c'} 100%);
  color: white;
  font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 2px 6px ${props => props.$themeColor || '#f97316'}40;
  transition: all 0.2s;

  &:hover {
    background: linear-gradient(135deg, ${props => props.$themeColorDark || '#ea580c'} 0%, ${props => props.$themeColor || '#f97316'} 100%);
    color: white;
    box-shadow: 0 4px 12px ${props => props.$themeColor || '#f97316'}50;
  }

  @media (max-width: 680px) {
    padding: 8px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    gap: 0;
  }
`;

const HeaderShortcutLabel = styled.span`
  @media (max-width: 680px) {
    display: none;
  }
`;

const SearchBar = styled.div`
  position: relative;
  width: 100%;
`;

const CatalogToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  position: relative;
  flex: 0 0 auto;

  ${SearchBar} {
    flex: 1 1 320px;
    min-width: min(100%, 260px);
  }

  @media (max-width: 640px) {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;

    ${SearchBar} {
      flex-basis: auto;
      min-width: 0;
    }
  }
`;

const AddProductButton = styled.button`
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  border: 1.5px solid ${props => props.$themeColor};
  color: ${props => props.$themeColor};
  padding: 0 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex: 0 0 auto;

  &:hover {
    background: ${props => props.$themeColor};
    color: white;
  }

  @media (max-width: 640px) {
    width: 100%;
    height: 34px;
    font-size: 11.5px;
    border-radius: 8px;
    padding: 0 12px;
    gap: 4px;
  }
`;

const FloatingSuggestBox = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12), 0 4px 10px rgba(15, 23, 42, 0.04);
  z-index: 150;
  overflow: hidden;
  max-height: 320px;
  display: flex;
  flex-direction: column;
`;

const SuggestList = styled.div`
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SuggestItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
  min-width: 0;
  gap: 8px;

  &:hover {
    background: #f8fafc;
  }
`;

const SuggestItemMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;

  strong {
    color: #0f172a;
    font-size: 12px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  span {
    color: #64748b;
    font-size: 10px;
    font-weight: 600;
  }
`;

const SuggestAddIcon = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: ${props => props.$themeColor}12;
  color: ${props => props.$themeColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  flex: 0 0 auto;
  transition: all 0.2s;

  ${SuggestItem}:hover & {
    background: ${props => props.$themeColor};
    color: white;
  }
`;

const SuggestAddBtn = styled.button`
  padding: 2px 8px;
  font-size: 9px;
  border-radius: 5px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid ${props => props.$outline ? props.$themeColor : '#e2e8f0'};
  background: ${props => props.$outline ? 'white' : props.$themeColor};
  color: ${props => props.$outline ? props.$themeColor : 'white'};
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  &:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
`;

const SuggestStepper = styled.div`
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 5px;
  padding: 1px;
  height: 20px;
`;

const SuggestQtyBtn = styled.button`
  border: 0;
  background: transparent;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  cursor: pointer;
  &:hover { background: white; color: #0f172a; }
`;

const SuggestQtyVal = styled.div`
  font-weight: 800;
  font-size: 10px;
  min-width: 16px;
  text-align: center;
  color: #0f172a;
`;

const NoSuggests = styled.div`
  padding: 20px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
`;

const SearchInput = styled.input`
  width: 100%;
  height: 42px;
  box-sizing: border-box;
  padding: 0 16px 0 44px;
  background: white;
  color: #000000;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  transition: all 0.2s;
  &:focus { border-color: ${props => props.$themeColor || '#ea580c'}; box-shadow: 0 0 0 3px ${props => props.$themeColor}15; }

  @media (max-width: 520px) {
    padding: 8px 12px 8px 36px;
    border-radius: 8px;
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 16px;
`;

const CategoryScroll = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 2px 6px;
  flex: 0 0 auto;
  scroll-padding-inline: 2px;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar { display: none; }
`;

const CatBtn = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid ${props => props.$active ? props.$themeColor : '#e2e8f0'};
  background: ${props => props.$active ? props.$themeColor : 'white'};
  color: ${props => props.$active ? 'white' : '#64748b'};
  font-weight: 700;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.03); }
`;

const FilterTabs = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 2px 4px;
  flex: 0 0 auto;
  scroll-padding-inline: 2px;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar { display: none; }
`;

const FilterBtn = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: 0;
  background: ${props => props.$active ? props.$themeColor : '#eef2f7'};
  color: ${props => props.$active ? 'white' : '#475569'};
  font-weight: 800;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
`;

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding: 2px 4px 28px 0;
  min-height: 0;
  width: 100%;
  min-width: 0;
  flex: 1;
  align-content: start;

  @media (min-width: 1800px) {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  @media (max-width: 1280px) {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    overflow: visible;
    padding-right: 0;
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
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
  align-content: start;

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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #edf2f7;

  @media (max-width: 560px) {
    align-items: stretch;
    flex-direction: column;
    padding: 8px 10px;
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
  border-radius: 8px;
  border: 1.5px solid ${props => props.$inCart ? props.$themeColor : '#f1f5f9'};
  padding: 0;
  display: grid;
  grid-template-rows: 72px 1fr;
  gap: 0;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  overflow: hidden;
  font: inherit;
  min-width: 0;
  min-height: 158px;
  &:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.03); border-color: ${props => props.$themeColor}40; }

  @media (max-width: 640px) {
    border-radius: 6px;
    grid-template-rows: 60px 1fr;
    min-height: 150px;

    &:hover {
      transform: none;
    }
  }
`;

const ProdImg = styled.div`
  min-height: 0;
  position: relative;
  background-size: cover;
  background-position: center;
  background-color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  font-size: 16px;

  @media (max-width: 520px) {
    min-height: 0;
  }
`;

const ProductBody = styled.div`
  padding: 9px 10px 10px;
  display: grid;
  grid-template-rows: minmax(32px, auto) auto auto;
  gap: 6px;
  min-width: 0;
  min-height: 0;
`;

const VegBadge = styled.div`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid ${props => props.$nonVeg ? '#dc2626' : '#16a34a'};
  background: white;
  color: ${props => props.$nonVeg ? '#dc2626' : '#16a34a'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 6px;
`;

const CategoryTag = styled.span`
  width: fit-content;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 9px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProdName = styled.div`
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
  line-height: 1.25;
  min-height: 32px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
`;

const ProdPriceRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  min-height: 28px;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const ProdPrice = styled.div`
  font-weight: 800;
  font-size: 14px;
  color: ${props => props.$themeColor};
  white-space: nowrap;
`;

const AddBtn = styled.div`
  height: 28px;
  border-radius: 7px;
  background: ${props => props.$outline ? 'white' : props.$themeColor};
  border: 1.5px solid ${props => props.$themeColor};
  color: ${props => props.$outline ? props.$themeColor : 'white'};
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  transition: all 0.2s;
  white-space: nowrap;

  @media (max-width: 520px) {
    width: 100%;
    height: 24px;
    font-size: 10px;
    padding: 0 6px;
    border-radius: 6px;
  }
`;

const ProductStepper = styled.div`
  height: 28px;
  width: 82px;
  border-radius: 7px;
  border: 1.5px solid ${props => props.$themeColor};
  background: white;
  color: #0f172a;
  display: grid;
  grid-template-columns: 26px 1fr 26px;
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
  font-size: 9px;
  padding: 0;
  height: 100%;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const ProductQtyValue = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 850;
  font-size: 12px;
  color: #0f172a;
`;

const VariantCount = styled.span`
  min-width: 12px;
  height: 12px;
  border-radius: 999px;
  padding: 0 2px;
  background: ${props => props.$themeColor};
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 7.5px;
  font-weight: 900;
  margin-right: 2px;
`;

const CartHeader = styled.div`
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  @media (max-width: 1280px) {
    padding: 8px 12px;
  }
`;

const CartBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;

  @media (max-width: 520px) {
    padding: 8px 10px;
  }
`;

const CartFooter = styled.div`
  padding: 10px 14px;
  border-top: 1px solid #e2e8f0;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 6px;

  @media (max-width: 1280px) {
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  }

  @media (max-width: 520px) {
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
  }
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-weight: ${props => props.$bold ? '800' : '600'};
  font-size: ${props => props.$bold ? '16px' : '11.5px'};
  color: ${props => props.$bold ? '#0f172a' : '#64748b'};
`;

const PayBtn = styled.button`
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  background: linear-gradient(135deg, ${props => props.$color} 0%, ${props => props.$colorDark} 100%);
  color: white;
  font-size: 13px;
  font-weight: 800;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px -2px ${props => props.$color}40;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  transition: transform 0.1s, box-shadow 0.1s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px -2px ${props => props.$color}50;
  }

  &:active {
    transform: translateY(1px);
  }

  &:disabled {
    background: #cbd5e1;
    color: #94a3b8;
    box-shadow: none;
    cursor: not-allowed;
    transform: none;
  }
`;

const DiscountBtn = styled.button`
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

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const DiscountModalContent = styled.div`
  background: white;
  width: min(480px, 94vw);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${fadeIn} 0.2s ease-out;
`;

const DiscountModalHeader = styled.div`
  padding: 8px 12px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const DiscountTabHeader = styled.div`
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 0 16px;
`;

const DiscountTabButton = styled.button`
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

const DiscountModalBody = styled.div`
  padding: 16px 20px;
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DiscountModalFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #edf2f7;
  display: flex;
  gap: 10px;
`;

const DiscountRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f8fafc;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #edf2f7;
`;

const DiscountRowInfo = styled.div`
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

const DiscountInputWrapper = styled.div`
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

const DiscUnitToggle = styled.button`
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
  flex-direction: column;
  gap: 3px;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
  background: white;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.01);
  transition: all 0.15s ease;
  
  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.02);
  }
`;

const CartItemInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const QtyGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  background: #f8fafc;
  padding: 1.5px 4px;
  border-radius: 4px;
  flex: 0 0 auto;
`;

const QtyBtn = styled.button`
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: none;
  background: white;
  color: #64748b;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 7px;
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

  @media (max-width: 1280px) {
    display: inline-flex;
  }
`;

const MobileCartBackdrop = styled.div`
  display: none;

  @media (max-width: 1280px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.38);
    z-index: 1000;
  }
`;

const MobileCartToggle = styled.button`
  display: none;

  @media (max-width: 1280px) {
    position: fixed;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 990;
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

  @media (max-width: 420px) {
    gap: 8px;
    min-width: calc(100% - 24px);
    min-height: 52px;
    padding: 0 16px;
    font-size: 12px;
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

const CounterSplitGrid = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.02);
  overflow: hidden;

  @media (max-width: 768px) {
    flex-direction: column;
    overflow: visible;
    min-height: auto;
    height: auto;
  }
`;

const CounterCartListPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  @media (max-width: 768px) {
    min-height: 250px;
    max-height: 380px;
  }
`;

const CounterCalculationsPanel = styled.div`
  width: 240px;
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 8px;
  justify-content: space-between;
  height: 100%;
  overflow: hidden;

  @media (max-width: 768px) {
    width: 100%;
    border-left: 0;
    border-top: 1px solid #e2e8f0;
    height: auto;
    overflow: visible;
  }
`;

const CustomerPickerArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
  z-index: 10;
  min-width: 200px;

  @media (max-width: 720px) {
    width: 100%;
    min-width: 0;
  }
`;

const CustomerInputWrap = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 8px;
  height: 30px;
  gap: 6px;
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
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  min-width: 100px;
  &::placeholder {
    color: #94a3b8;
    font-weight: 500;
  }
`;

const CreditPickerRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const CreditSelectWrap = styled.div`
  flex: 1;
  min-width: 140px;
`;

const CreditNewButton = styled.button`
  height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  color: #0f766e;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  &:hover {
    background: #f0fdfa;
    border-color: #5eead4;
  }
`;

const CreditToggleButton = styled.button`
  height: 30px;
  border: 1px solid ${props => props.$active ? '#14b8a6' : '#99f6e4'};
  border-radius: 8px;
  background: ${props => props.$active ? '#14b8a6' : 'white'};
  color: ${props => props.$active ? 'white' : '#0f766e'};
  padding: 0 10px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-shadow: ${props => props.$active ? '0 6px 16px rgba(20, 184, 166, 0.16)' : 'none'};
`;

const CreditMeta = styled.div`
  font-size: 10px;
  font-weight: 800;
  color: ${props => props.$warn ? '#c2410c' : '#64748b'};
  padding-left: 4px;
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

const DateTimeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
`;

const DateTimeInput = styled.input`
  flex: 1;
  height: 28px;
  border: 1.5px solid #cbd5e1;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 0 8px;
  outline: none;
  background: white;
  color: #0f172a;
  transition: all 0.2s;
  &:focus {
    border-color: ${props => props.$themeColor};
  }
`;



export default function CounterSale({ 
  onBack, 
  initialTable, 
  onOrderCreated, 
  onCreditCustomerCreated, 
  interfaceMode = 'counter',
  config: propConfig = null,
  initialCreditCustomers = null
}) {
  const { notify } = useNotification();
  const router = useRouter();
  const { timezone, orgId } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['ALL']);
  const [activeCat, setActiveCat] = useState('ALL');
  const [dietFilter, setDietFilter] = useState('ALL');
  const [trendingProductIds, setTrendingProductIds] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [orderMode, setOrderMode] = useState('settle'); // 'kitchen' | 'settle'
  const [productListingOn, setProductListingOn] = useState(true);
  const [discountType, setDiscountType] = useState('amount'); // 'amount' | 'percentage'
  const [discountValue, setDiscountValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false); // PaymentDialog shown BEFORE order creation in settle mode
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
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const [isCreditSale, setIsCreditSale] = useState(false);
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);
  const [defaultPricelistId, setDefaultPricelistId] = useState(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [localDiscounts, setLocalDiscounts] = useState({});
  const [localOrderDiscountType, setLocalOrderDiscountType] = useState('amount');
  const [localOrderDiscountValue, setLocalOrderDiscountValue] = useState(0);
  const [discountModalTab, setDiscountModalTab] = useState('line'); // 'line' | 'total'
  const [selectedProductForPopup, setSelectedProductForPopup] = useState(null);
  const [popupViewOnly, setPopupViewOnly] = useState(false);
  const customersEnabled = isCustomersModuleEnabled(config);
  const discountsEnabled = isDiscountModuleEnabled(config);
  const kitchenEnabled = isKitchenModuleEnabled(config);

  const startNewProductForPopup = () => {
    setSelectedProductForPopup({
      name: '', description: '', price: 0, isAvailable: true, imageUrl: '',
      productType: 'VEG', isVariant: false, isPackagedGood: false, isIngredient: false, productCode: '',
      taxRate: 0, taxCode: '', mrp: 0, costPrice: 0, barcode: '', minStockLevel: 0,
      kdsStation: '', uom: null, category: null, isActive: true,
      variantMappings: [], variantPricings: [], upsells: [], pricelistProducts: [], recipeLines: []
    });
    setPopupViewOnly(false);
  };

  const refreshProductsList = async (updatedProduct = null) => {
    try {
      const [pResp, catResp] = await Promise.all([
        api.get('/api/v1/products'),
        api.get('/api/v1/products/categories').catch(() => ({ data: { data: [] } }))
      ]);
      if (pResp.data.success) {
        const pList = pResp.data.data || [];
        setProducts(pList);
        const currentOrgId = orgId && orgId !== '0' ? orgId : null;
        const activeCats = (catResp?.data?.data || [])
          .filter(c => c.isActive !== false && (!c.orgId || (currentOrgId && String(c.orgId) === String(currentOrgId))))
          .map(c => c.name);
        const productCats = pList.map(p => p.categoryName).filter(Boolean);
        const cats = ['ALL', ...new Set([...activeCats, ...productCats])];
        setCategories(cats);

        if (updatedProduct) {
          const updatedProductId = String(updatedProduct.id);
          const newPrice = Number(updatedProduct.price || 0);
          setCart(prevCart => prevCart.map(item => {
            if (String(item.productId || item.id) === updatedProductId) {
              if (!item.variantId) {
                return {
                  ...item,
                  price: newPrice,
                  name: updatedProduct.name,
                  displayName: updatedProduct.name
                };
              } else {
                const pricing = (updatedProduct.variantPricings || []).find(vp => String(vp.variantOption?.id || vp.variantOptionId || '') === String(item.variantId));
                if (pricing) {
                  const variantPrice = Number(pricing.overridePrice ?? pricing.additionalPrice ?? item.price ?? 0);
                  const displayName = `${updatedProduct.name} (${pricing.variantOption?.name || pricing.variantOption?.label || item.variantName})`;
                  return {
                    ...item,
                    price: variantPrice,
                    name: displayName,
                    displayName
                  };
                } else {
                  const displayName = `${updatedProduct.name} (${item.variantName || 'Option'})`;
                  return {
                    ...item,
                    name: displayName,
                    displayName
                  };
                }
              }
            }
            return item;
          }));
        }
      }
    } catch (err) {
      console.warn("Failed to refresh products list:", err);
    }
  };

  const handleEditProductFromCart = async (item) => {
    const prodId = item.productId || item.id;
    const localProd = products.find(p => p.id === prodId);
    if (localProd) {
      setSelectedProductForPopup(localProd);
      setPopupViewOnly(false);
    } else {
      try {
        const { data } = await api.get(`/api/v1/products/${prodId}`);
        if (data.success) {
          setSelectedProductForPopup(data.data);
          setPopupViewOnly(false);
        }
      } catch (e) {
        console.error("Failed to load product for editing", e);
        notify('error', "Failed to load product details for editing");
      }
    }
  };

  const customerInputRef = useRef(null);
  const searchRef = useRef(null);
  const isStandardUi = false; // Standard UI removed as per requirements

  const [isDateTimeManuallyEdited, setIsDateTimeManuallyEdited] = useState(false);
  const [orderDateTime, setOrderDateTime] = useState('');

  useEffect(() => {
    if (isDateTimeManuallyEdited) return;

    const updateTime = () => {
      setOrderDateTime(getLocalISOString(timezone));
    };

    updateTime();
    const interval = setInterval(updateTime, 5000);
    return () => clearInterval(interval);
  }, [timezone, isDateTimeManuallyEdited]);

  const propConfigRef = useRef(propConfig);
  const initialCreditCustomersRef = useRef(initialCreditCustomers);

  const cartKeyFor = useCallback((item) => String(item.cartKey || `${item.productId || item.id}:${item.variantId || 'base'}`), []);

  useEffect(() => {
    propConfigRef.current = propConfig;
  }, [propConfig]);

  useEffect(() => {
    initialCreditCustomersRef.current = initialCreditCustomers;
  }, [initialCreditCustomers]);

  // Sync config updates passively without resetting loading or wiping cart
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
    if (!kitchenEnabled && orderMode === 'kitchen') {
      setOrderMode('settle');
    }
  }, [kitchenEnabled, orderMode]);

  useEffect(() => {
    if (!customersEnabled) {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAge('');
      setSelectedCustomerId(null);
      setSelectedCustomers([]);
      setShowCustomerDropdown(false);
    }
  }, [customersEnabled]);

  useEffect(() => {
    if (!discountsEnabled) {
      setShowDiscountModal(false);
      setDiscountType('amount');
      setDiscountValue(0);
      setLocalOrderDiscountType('amount');
      setLocalOrderDiscountValue(0);
      setLocalDiscounts({});
      setCart(prev => prev.map(withoutDiscounts));
    }
  }, [discountsEnabled]);

  useEffect(() => {
    const stored = localStorage.getItem('pos_product_listing_enabled');
    if (stored !== null) {
      setProductListingOn(JSON.parse(stored));
    } else if (config) {
      setProductListingOn(config.posProductListingEnabled !== false);
    }
  }, [config]);

  const handleToggleProductListing = (enabled) => {
    setProductListingOn(enabled);
    localStorage.setItem('pos_product_listing_enabled', JSON.stringify(enabled));
  };

  // Sync credit customers passively without resetting loading or wiping cart
  useEffect(() => {
    if (initialCreditCustomers) {
      setCreditCustomers(initialCreditCustomers);
    }
  }, [initialCreditCustomers]);

  useEffect(() => {
    if (showDiscountModal) {
      const initial = {};
      cart.forEach(item => {
        const key = cartKeyFor(item);
        if (item.discount_percent > 0) {
          initial[key] = { type: 'percentage', value: item.discount_percent };
        } else if (item.discount_amount > 0) {
          initial[key] = { type: 'amount', value: item.discount_amount };
        } else if (item.discount) {
          initial[key] = { type: item.discount.type || 'amount', value: item.discount.value || 0 };
        } else {
          initial[key] = { type: 'amount', value: 0 };
        }
      });
      setLocalDiscounts(initial);
      setLocalOrderDiscountType(discountType || 'amount');
      setLocalOrderDiscountValue(discountValue || 0);
      setDiscountModalTab('line');
    }
  }, [showDiscountModal, cart, discountType, discountValue, cartKeyFor]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (customerInputRef.current && !customerInputRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  const activeOrderMode = kitchenEnabled ? orderMode : 'settle';

  useEffect(() => {
    if (activeOrderMode === 'kitchen') {
      setDiscountType('amount');
      setDiscountValue(0);
      setLocalOrderDiscountType('amount');
      setLocalOrderDiscountValue(0);
      setLocalDiscounts({});
      setCart(prev => prev.map(withoutDiscounts));
    }
  }, [activeOrderMode]);

  const THEME = activeOrderMode === 'kitchen'
    ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' }
    : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3' };

  const renderCustomerSelectionPanel = () => {
    if (!customersEnabled) return null;

    return (
      <div style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid #edf2f7', borderRadius: '12px', border: '1px solid #edf2f7', boxShadow: '0 4px 12px rgba(15,23,42,0.015)' }}>
        <CustomerPickerArea ref={customerInputRef} style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Customer Details
          </div>
          {!config?.allowMultipleCustomersPerOrder && selectedCustomerId ? (
            <CustomerChip style={{ padding: '6px 12px', fontSize: '12px', width: '100%', justifyContent: 'space-between', borderRadius: '8px' }}>
              <span>{customerName} {customerPhone ? `(${customerPhone})` : ''}</span>
              <RemoveChip onClick={() => removeCustomer(selectedCustomerId)} style={{ display: 'flex', alignItems: 'center' }}><FaTimes size={10}/></RemoveChip>
            </CustomerChip>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <CustomerInputWrap style={{ height: 34, padding: '0 8px', borderRadius: '8px', gap: '6px' }}>
                <FaUsers color="#94a3b8" size={11} />
                <CustomerInput
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onKeyDown={handleCustomerKeyDown}
                  style={{ fontSize: '12px' }}
                />
              </CustomerInputWrap>

              <div style={{ display: 'flex', gap: '6px' }}>
                <CustomerInputWrap style={{ flex: 1, height: 34, padding: '0 8px', borderRadius: '8px', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>📞</span>
                  <CustomerInput
                    placeholder="Phone Number (Optional)"
                    value={customerPhone}
                    onChange={e => {
                      setCustomerPhone(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onKeyDown={handleCustomerKeyDown}
                    style={{ fontSize: '12px' }}
                  />
                </CustomerInputWrap>

                {config?.customerAgeEnabled && (
                  <CustomerInputWrap style={{ width: '60px', height: 34, padding: '0 8px', borderRadius: '8px', gap: '4px' }}>
                    <CustomerInput
                      placeholder="Age"
                      value={customerAge}
                      onChange={e => setCustomerAge(e.target.value)}
                      style={{ fontSize: '12px', textAlign: 'center' }}
                      type="number"
                    />
                  </CustomerInputWrap>
                )}
              </div>
            </div>
          )}

          {showCustomerDropdown && (customerName || customerPhone) && filteredCustomers.length > 0 && (
            <CustomerDropdown style={{ zIndex: 110 }}>
              {filteredCustomers.map(c => (
                <CustomerOption key={c.id} onClick={() => selectCustomer(c)}>
                  <CustomerName>{c.name}</CustomerName>
                  <CustomerPhone>{c.phone || 'No phone'}</CustomerPhone>
                </CustomerOption>
              ))}
            </CustomerDropdown>
          )}

          {config?.allowMultipleCustomersPerOrder && selectedCustomers.length > 0 && (
            <CustomerChips style={{ marginTop: '6px' }}>
              {selectedCustomers.map(c => (
                <CustomerChip key={c.id} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '8px' }}>
                  {c.name}
                  <RemoveChip onClick={() => removeCustomer(c.id)} style={{ display: 'flex', alignItems: 'center' }}><FaTimes size={8}/></RemoveChip>
                </CustomerChip>
              ))}
            </CustomerChips>
          )}
        </CustomerPickerArea>
      </div>
    );
  };

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    setProducts([]);
    setCategories(['ALL']);
    setActiveCat('ALL');
    setVariantProduct(null);
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
        const currentPropConfig = propConfigRef.current;
        const currentCreditCustomers = initialCreditCustomersRef.current;

        const promises = [
          api.get('/api/v1/products'),
          currentPropConfig ? Promise.resolve({ data: { data: currentPropConfig } }) : api.get('/api/v1/configurations'),
          api.get('/api/v1/purchasing/customers').catch(() => ({ data: { data: [] } })),
          currentCreditCustomers ? Promise.resolve({ data: { data: currentCreditCustomers } }) : api.get('/api/v1/credit/customers', { params: { status: 'ACTIVE' } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/v1/purchasing/pricelists/type/SALE').catch(() => ({ data: { data: [] } })),
          api.get('/api/v1/products/categories').catch(() => ({ data: { data: [] } }))
        ];
        const [pRes, cRes, custRes, creditRes, pricelistRes, catRes] = await Promise.all(promises);
        const pList = pRes.data.data || [];
        setProducts(pList);
        const nextConfig = cRes.data.data;
        setConfig(nextConfig);
        if (!nextConfig?.creditEnabled) {
          setIsCreditSale(false);
          setSelectedCreditCustomerId('');
        }
        if (custRes?.data?.data) {
          setAllCustomers(custRes.data.data);
        }
        if (creditRes?.data?.data) {
          setCreditCustomers(creditRes.data.data);
        }
        if (pricelistRes?.data?.data) {
          const list = pricelistRes.data.data || [];
          const def = list.find(p => p.isDefault === true || p.is_default === true) || list[0];
          if (def) {
            setDefaultPricelistId(def.id);
          }
        }
        const currentOrgId = orgId && orgId !== '0' ? orgId : null;
        const activeCats = (catRes?.data?.data || [])
          .filter(c => c.isActive !== false && (!c.orgId || (currentOrgId && String(c.orgId) === String(currentOrgId))))
          .map(c => c.name);
        const productCats = pList.map(p => p.categoryName).filter(Boolean);
        const cats = ['ALL', ...new Set([...activeCats, ...productCats])];
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
  }, [orgId]);

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

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [cart]
  );

  const cartCountLabel = `${cartItemCount} Item${cartItemCount === 1 ? '' : 's'}`;

  const selectedCreditCustomer = useMemo(
    () => creditCustomers.find(customer => String(customer.id) === String(selectedCreditCustomerId)) || null,
    [creditCustomers, selectedCreditCustomerId]
  );

  const creditCustomerOptions = useMemo(
    () => creditCustomers.map(customer => {
      const dp = config?.currencyDecimalPlaces ?? 2;
      return {
        value: customer.id,
        label: `${customer.name || 'Credit Customer'}${customer.phone ? ` (${customer.phone})` : ''} - ₹${Number(customer.balance || 0).toFixed(dp)}`,
      };
    }),
    [creditCustomers, config]
  );

  const handleCreditCustomerCreated = useCallback((customer) => {
    if (!customer?.id) return;
    setCreditCustomers(current => {
      const next = [customer, ...current.filter(item => String(item.id) !== String(customer.id))];
      return next.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
    });
    setSelectedCreditCustomerId(customer.id);
    onCreditCustomerCreated?.(customer);
  }, [onCreditCustomerCreated]);

  const toggleCreditSale = () => {
    const next = !isCreditSale;
    setIsCreditSale(next);
    if (next) {
      setSelectedCustomerId(null);
      setSelectedCustomers([]);
      setShowCustomerDropdown(false);
    } else {
      setSelectedCreditCustomerId('');
    }
  };

  const hasExtendedOptions = useCallback((product) => (
    Boolean(product?.hasVariants) || Number(product?.variantCount || 0) > 0 || Boolean(product?.hasUpsells)
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
      notify('error', 'Unable to load item options. Please try again.');
    } finally {
      setVariantLoading(false);
    }
  };

  const addToCart = async (p) => {
    if (hasExtendedOptions(p)) {
      await openVariantSelector(p);
      return;
    }
    addPreparedToCart({ ...p, cartKey: `${p.id}:base`, productId: p.id, displayName: p.name });
  };

  const addVariantToCart = (variant, additionalItems = []) => {
    if (!variantProduct) return;
    if (variant) {
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
    }

    if (additionalItems && additionalItems.length > 0) {
      additionalItems.forEach(item => addPreparedToCart(item));
    }

    setVariantProduct(null);
  };

  const syncVariantCart = (selectedVariants, additionalItems = []) => {
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

    if (additionalItems && additionalItems.length > 0) {
      additionalItems.forEach(item => addPreparedToCart(item));
    }

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
      if (p.isActive === false || p.isactive === 'N') return false;
      if (p.isIngredient === true || p.is_ingredient === true || String(p.isIngredient).toUpperCase() === 'Y' || String(p.is_ingredient).toUpperCase() === 'Y') return false;
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
      .filter(p => {
        if (p.isActive === false || p.isactive === 'N') return false;
        if (p.isIngredient === true || p.is_ingredient === true || String(p.isIngredient).toUpperCase() === 'Y' || String(p.is_ingredient).toUpperCase() === 'Y') return false;
        return String(p.name || '').toLowerCase().includes(normalizedTerm);
      })
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
      setDiscountValue(0);
      setDiscountType('amount');
    }
  }, [cart.length]);

  useEffect(() => {
    if (orderMode === 'kitchen') {
      setDiscountValue(0);
      setDiscountType('amount');
    }
  }, [orderMode]);

  const totals = useMemo(() => {
    if (!config) return { subtotal: 0, tax: 0, total: 0 };
    const cartForTotals = discountsEnabled ? cart : cart.map(withoutDiscounts);
    const orderDiscount = discountsEnabled ? { type: discountType, value: discountValue } : { type: 'amount', value: 0 };
    // NOTE: round_off_config is intentionally NOT passed here.
    // Round-off is a payment-settlement concept and is applied only inside PaymentDialog.
    return calculateOrderTotals(
      cartForTotals.map(i => ({
        ...i,
        id: cartKeyFor(i),
        productId: i.productId || i.id,
        name: i.displayName || i.name,
        quantity: i.qty,
        tax_rate: (i.taxRate !== undefined && i.taxRate !== null && i.taxRate !== '') ? Number(i.taxRate) : null,
        is_packaged_good: i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true,
        is_packaged: i.isPackagedGood === true || i.is_packaged_good === true || i.is_packaged === true
      })),
      orderDiscount,
      { 
        gst_enabled: config.taxEnabled,
        default_tax_rate: (() => {
          if (!config.taxEnabled) return 0;
          const rates = config.taxRates || [];
          const def = rates.find(r => r.id === config.taxDefaultId);
          return def ? parseFloat(def.value) || 0 : (rates[0] ? parseFloat(rates[0].value) || 0 : 0);
        })(),
        prices_include_tax: config.pricesIncludeTax,
        currencyDecimalPlaces: config.currencyDecimalPlaces,
        // No round_off_config — round-off belongs in PaymentDialog only
      }
    );
  }, [cart, config, cartKeyFor, discountType, discountValue, discountsEnabled]);

  // Preview-only round-off for display on sales screen (automatic mode only, informational).
  // The actual round-off is computed and confirmed inside PaymentDialog.
  const roundOffPreview = useMemo(() => {
    if (!config?.roundOffEnabled || config?.roundOffMode !== 'automatic') return 0;
    const base = totals.total_inc_tax || 0;
    const factor = Number(config.roundOffAutoFactor ?? 1);
    if (factor <= 0) return 0;
    const rounded = Math.round(base / factor) * factor;
    return Number((rounded - base).toFixed(config?.currencyDecimalPlaces ?? 2));
  }, [config, totals]);

  const creditLimitWarning = useMemo(() => {
    if (!selectedCreditCustomer) return '';
    const limit = Number(selectedCreditCustomer.creditLimit || 0);
    const dp = config?.currencyDecimalPlaces ?? 2;
    if (limit <= 0) return '';
    const projected = Number(selectedCreditCustomer.balance || 0) + Number(totals?.total_inc_tax || 0);
    return projected > limit ? `Credit limit warning: projected balance ₹${projected.toFixed(dp)} exceeds ₹${limit.toFixed(dp)}.` : '';
  }, [selectedCreditCustomer, totals?.total_inc_tax, config]);

  const buildCustomerSelections = () => {
    if (!customersEnabled) return [];

    const selections = [];
    const seen = new Set();
    const addSelection = (customer) => {
      if (!customer) return;
      const name = String(customer.name || '').trim();
      const phone = String(customer.phone || '').trim();
      const id = customer.id || null;
      if (!id && !name && !phone) return;
      const key = id ? `id:${id}` : phone ? `phone:${phone}` : `name:${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      selections.push({ id, name: name || null, phone: phone || null });
    };

    if (config?.allowMultipleCustomersPerOrder) {
      selectedCustomers.forEach(addSelection);
      addSelection({ name: customerName, phone: customerPhone });
    } else if (selectedCustomerId) {
      addSelection({ id: selectedCustomerId, name: customerName, phone: customerPhone });
    } else {
      addSelection({ name: customerName, phone: customerPhone });
    }

    return selections;
  };

  const handleApplyDiscounts = () => {
    if (!discountsEnabled) return;

    setCart(prev => prev.map(item => {
      const key = cartKeyFor(item);
      const disc = localDiscounts[key];
      if (disc) {
        if (disc.type === 'percentage') {
          return {
            ...item,
            discount_percent: disc.value,
            discount_amount: 0,
            discount: { type: 'percent', value: disc.value }
          };
        } else {
          return {
            ...item,
            discount_percent: 0,
            discount_amount: disc.value,
            discount: { type: 'amount', value: disc.value }
          };
        }
      }
      return item;
    }));
    setDiscountType(localOrderDiscountType);
    setDiscountValue(localOrderDiscountValue);
    setShowDiscountModal(false);
  };

  const handleClearAllDiscounts = () => {
    if (!discountsEnabled) return;

    setLocalDiscounts(prev => {
      const next = {};
      Object.keys(prev).forEach(key => {
        next[key] = { type: 'amount', value: 0 };
      });
      return next;
    });
    setLocalOrderDiscountType('amount');
    setLocalOrderDiscountValue(0);
  };

  // Opens the PaymentDialog BEFORE creating the order in settle mode.
  // On confirmation, handlePlaceOrder is called with the payment payload.
  const handleCompleteSettle = () => {
    if (cart.length === 0 || processing) return;
    setShowSettleDialog(true);
  };

  const handlePlaceOrder = async (paymentPayload = null) => {
    if (processing) return;
    setProcessing(true);
    try {
      const saveCustomerToDb = async (name, phone) => {
        const payload = {
          name: name.trim(),
          phone: phone ? phone.trim() : null,
          pricelistId: defaultPricelistId,
          isactive: 'Y'
        };
        const { data } = await api.post('/api/v1/purchasing/customers', payload);
        return data.data; // Created customer entity with real UUID
      };

      let primaryCustomer = null;
      let customerSelections = [];

      if (customersEnabled) {
        if (isCreditSale && selectedCreditCustomer) {
          primaryCustomer = {
            id: selectedCreditCustomer.linkedCustomerId || null,
            name: selectedCreditCustomer.name || null,
            phone: selectedCreditCustomer.phone || null,
          };
          customerSelections = [primaryCustomer];
        } else if (config?.allowMultipleCustomersPerOrder) {
          const resolvedList = [];
          for (const c of selectedCustomers) {
            if (String(c.id).startsWith('temp-')) {
              const saved = await saveCustomerToDb(c.name, c.phone);
              resolvedList.push({ id: saved.id, name: saved.name, phone: saved.phone });
            } else {
              resolvedList.push({ id: c.id, name: c.name, phone: c.phone });
            }
          }
          if (customerName.trim()) {
            const saved = await saveCustomerToDb(customerName, customerPhone);
            resolvedList.push({ id: saved.id, name: saved.name, phone: saved.phone });
          }
          customerSelections = resolvedList;
          primaryCustomer = resolvedList[0] || null;
        } else {
          if (selectedCustomerId && String(selectedCustomerId).startsWith('temp-')) {
            const saved = await saveCustomerToDb(customerName, customerPhone);
            primaryCustomer = { id: saved.id, name: saved.name, phone: saved.phone };
            customerSelections = [primaryCustomer];
          } else if (selectedCustomerId) {
            primaryCustomer = { id: selectedCustomerId, name: customerName, phone: customerPhone };
            customerSelections = [primaryCustomer];
          } else if (customerName.trim()) {
            const saved = await saveCustomerToDb(customerName, customerPhone);
            primaryCustomer = { id: saved.id, name: saved.name, phone: saved.phone };
            customerSelections = [primaryCustomer];
          }
        }
      }

      const dp = config?.currencyDecimalPlaces ?? 2;
      const processedLines = (totals.processed_items || []).map((pi, idx) => {
        // processed_items are in the same order as cart — use index for reliable 1:1 mapping
        const cartItem = cart[idx] || null;
        const unitPrice = Number(pi.unit_price ?? pi.price ?? cartItem?.price ?? 0);
        const productName = pi.item_name || pi.name || cartItem?.displayName || cartItem?.name || 'Item';

        // GST enrichment
        const gstEnabled = Boolean(config?.taxEnabled);
        const taxRatePct  = Number(pi.tax_rate || 0);
        const isInclusive = gstEnabled && (pi.is_packaged_good || Boolean(config?.pricesIncludeTax));
        const discType    = cartItem?.discount?.type; // 'percent' | 'amount'

        // Resolve tax code/name snapshot from config rates
        const matchedRate = (config?.taxRates || []).find(r => parseFloat(r.value) === taxRatePct);
        const taxCode     = gstEnabled && taxRatePct > 0 ? (matchedRate?.code  || `GST_${taxRatePct}`) : null;
        const taxName     = gstEnabled && taxRatePct > 0 ? (matchedRate?.name  || `GST ${taxRatePct}%`) : null;
        const qty         = Number(pi.quantity || 1);

        return {
          productId: cartItem?.productId || pi.productId || pi.product_id || pi.id || pi.pid || null,
          variantId: cartItem?.variantId || null,
          productName,
          categoryName: cartItem?.categoryName || pi.categoryName || pi.category || null,
          isPackagedGood: Boolean(cartItem?.isPackagedGood ?? cartItem?.is_packaged_good ?? cartItem?.is_packaged ?? pi.isPackagedGood ?? pi.is_packaged_good ?? pi.is_packaged),
          quantity: qty,
          unitPrice: Number(unitPrice.toFixed(dp)),
          unitOfMeasure: cartItem?.uomName || cartItem?.unitOfMeasure || pi.unitOfMeasure || pi.unit_of_measure || 'units',
          taxRate: taxRatePct,
          taxAmount: Number(Number(pi.tax_amount || 0).toFixed(dp)),
          discountAmount: Number(Number(pi.discount_amount || 0).toFixed(dp)),
          lineTotal: Number(Number(pi.line_total || (unitPrice * qty)).toFixed(dp)),

          // ─── GST Enrichment fields (V1_110) ───────────────────────────
          grossLineAmount:          Number((unitPrice * qty).toFixed(dp)),
          unitPriceExTax:           Number((pi.unit_price_ex_tax || pi.unit_price_ex_tax_orig || 0).toFixed(dp + 2)),
          taxableAmount:            Number((pi.taxable_amount || 0).toFixed(dp)),
          taxType:                  isInclusive ? 'INCLUSIVE' : (gstEnabled && taxRatePct > 0 ? 'EXCLUSIVE' : 'NONE'),
          taxSnapshotRate:          taxRatePct,
          taxCode,
          taxName,
          manualDiscountAmount:     (discType !== 'percent' && cartItem?.discount?.value > 0) ? Number(cartItem.discount.value.toFixed(dp)) : null,
          manualDiscountPercent:    (discType === 'percent' && cartItem?.discount?.value > 0) ? Number(cartItem.discount.value.toFixed(dp + 2)) : null,
          allocatedOrderDiscount:   Number((pi.order_discount_share || 0).toFixed(dp)),
        };
      });

      const knownOffline = isKnownOffline();
      const mainOfflineDevice = isMainOfflineBillingDevice();
      const effectiveOrderMode = kitchenEnabled ? orderMode : 'settle';
      if (isCreditSale && knownOffline) {
        throw new Error('Credit orders are online-only in this release.');
      }
      if (isCreditSale && !selectedCreditCustomerId) {
        throw new Error('Choose a credit customer before completing a credit sale.');
      }
      const isCreditFinal = isCreditSale && effectiveOrderMode === 'settle';
      const isOfflineFinal = knownOffline && effectiveOrderMode === 'settle' && mainOfflineDevice;

      // When paymentPayload is present this is a settle-mode order: go directly to COMPLETED/PAID.
      // Kitchen orders remain KITCHEN/PENDING as before.
      const isSettleDirect = effectiveOrderMode === 'settle' && paymentPayload !== null;

      let parsedDate = null;
      try {
        if (orderDateTime) {
          parsedDate = businessTimeToUtc(orderDateTime, timezone);
        }
      } catch (err) {
        console.error('Failed to parse custom date time', err);
      }

      const plannedPrintKind = effectiveOrderMode === 'kitchen'
        ? 'kot'
        : (isSettleDirect || isCreditFinal || isOfflineFinal ? 'bill' : 'settle');

      const payload = {
        orderType: 'SALE',
        ...(orgId ? { orgId } : {}),
        orderSource: knownOffline ? 'OFFLINE' : 'ONLINE',
        ...(parsedDate ? { orderDate: parsedDate } : {}),
        fulfillmentType: (initialTable && initialTable.tableNumber !== 'COUNTER')
          ? 'DINE_IN'
          : (initialTable?.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY'),
        tableNumber: (initialTable && initialTable.tableNumber !== 'COUNTER') ? initialTable.tableNumber : null,
        tableId: (initialTable && initialTable.tableNumber !== 'COUNTER') ? initialTable.id : null,
        // ─── Status: go DIRECTLY to COMPLETED/PAID on settle. No BILLED intermediate. ───
        orderStatus: effectiveOrderMode === 'kitchen'
          ? 'KITCHEN'
          : (isSettleDirect
            ? (paymentPayload.paymentMethod === 'CREDIT' ? 'COMPLETED' : 'COMPLETED')
            : (isCreditFinal ? 'COMPLETED' : (isOfflineFinal ? 'COMPLETED' : 'BILLED'))),
        paymentStatus: effectiveOrderMode === 'kitchen'
          ? 'PENDING'
          : (isSettleDirect
            ? (paymentPayload.paymentMethod === 'CREDIT' ? 'PENDING' : 'PAID')
            : (isCreditFinal ? 'PENDING' : (isOfflineFinal ? 'PAID' : 'PENDING'))),
        ...(isSettleDirect
          ? { reference: paymentPayload.paymentMethod }
          : (isCreditFinal ? { reference: 'CREDIT' } : (isOfflineFinal ? { reference: 'CASH' } : {}))),
        isCredit: isSettleDirect ? paymentPayload.paymentMethod === 'CREDIT' : isCreditFinal,
        creditCustomerId: isSettleDirect
          ? (paymentPayload.paymentMethod === 'CREDIT' ? paymentPayload.creditCustomerId || null : null)
          : (isCreditSale ? selectedCreditCustomerId || null : null),
        // ─── Embedded payment details (for direct COMPLETED orders) ───────
        ...(isSettleDirect && paymentPayload.paymentMethod !== 'CREDIT' ? {
          paymentMethod: paymentPayload.paymentMethod,
          amountPaid: paymentPayload.amountPaid,
          roundOffAmount: paymentPayload.roundOffAmount || 0,
          ...(paymentPayload.paymentMethod === 'MIXED' ? {
            paymentSplits: paymentPayload.paymentSplits,
          } : {}),
        } : {}),
        ...(customersEnabled ? {
          customerId: primaryCustomer?.id || null,
          customerIds: customerSelections.length > 0 ? customerSelections : null,
        } : {}),
        grandTotal: isSettleDirect
          ? Number((paymentPayload.amountPaid || totals.total_inc_tax).toFixed(dp))
          : Number(totals.total_inc_tax.toFixed(dp)),
        totalTaxAmount: Number(totals.total_tax.toFixed(dp)),
        totalDiscountAmount: Number(Number(totals.discount_amount || 0).toFixed(dp)),
        totalAmount: Number(totals.total_inc_tax.toFixed(dp)),

        // ─── GST Discount Engine order-level fields (V1_110) ───────────
        grossAmount: Number((totals.gross_face_total || 0).toFixed(dp)),
        orderDiscountType: discountType === 'percentage' ? 'PERCENT' : 'AMOUNT',
        orderDiscountValue: Number(discountValue || 0),
        discountSource: 'MANUAL',
        ...(!knownOffline && localPrintWillHandleOrder(plannedPrintKind)
          ? { skipAutoPrintKinds: [plannedPrintKind === 'kot' ? 'KOT' : 'BILL'] }
          : {}),

        lines: processedLines
      };

      if (knownOffline && effectiveOrderMode === 'settle' && !mainOfflineDevice) {
        throw new Error('Final offline billing is available only on the main billing device. This device can create provisional kitchen orders while offline.');
      }

      if (knownOffline && mainOfflineDevice) {
        await ensureOfflineSequenceLeases().catch(() => null);
        payload.syncOrigin = 'MAIN_OFFLINE';
        payload.sourceLocalRef = `LOCAL-${Date.now()}`;
        payload.orderNo = allocateOfflineSequence('SALE_ORDER');
        if (effectiveOrderMode === 'settle') {
          payload.offlineInvoiceNo = allocateOfflineSequence('CUSTOMER_INVOICE');
          payload.offlinePaymentNo = allocateOfflineSequence('INBOUND_PAYMENT');
        }
      }

      const res = await api.post('/api/v1/orders', payload, {
        skipOfflineQueue: knownOffline && effectiveOrderMode === 'settle' && !mainOfflineDevice,
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

        // isSettleDirect → kind = 'bill' so sales.js treats it as a completed settled sale
        // (not 'settle', which would open a second PaymentDialog in sales.js)
        const kind = plannedPrintKind;
        setShowSettleDialog(false);
        onOrderCreated?.(printOrder, kind);
        setIsDateTimeManuallyEdited(false);
        rememberTrending(cart);
        if (kind !== 'settle') {
          setCart([]);
          if (onBack) onBack();
        }
      }
    } catch (e) {
      if (e?.code === 'OFFLINE_CACHE_MISS') {
        notify('warning', 'Offline POS data is not prepared on this device yet. Open POS once while online before using it offline.');
      } else {
        notify('error', 'Failed to place order: ' + (e.response?.data?.message || e.message));
      }
    } finally {
      setProcessing(false);
    }
  };
  const filteredCustomers = useMemo(() => {
    if (!customersEnabled) return [];
    if (!customerPhone && !customerName) return [];
    const lowerName = customerName.toLowerCase();
    return allCustomers.filter(c => 
      (c.phone && c.phone.includes(customerPhone)) || 
      (c.name && c.name.toLowerCase().includes(lowerName))
    ).slice(0, 5);
  }, [allCustomers, customerName, customerPhone, customersEnabled]);

  const selectCustomer = (cust) => {
    if (!customersEnabled) return;

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
    if (!customersEnabled) return;

    if (id === selectedCustomerId) {
      setSelectedCustomerId(null);
      setCustomerName('');
      setCustomerPhone('');
    } else {
      setSelectedCustomers(selectedCustomers.filter(c => c.id !== id));
    }
  };

  const handleCustomerKeyDown = (e) => {
    if (!customersEnabled) return;

    if (e.key === 'Enter') {
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
            <TitleGroup $accentColor={THEME.main}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Title>
                  {initialTable
                    ? (initialTable.tableNumber === 'COUNTER'
                      ? (initialTable.orderType === 'DELIVERY' ? 'Delivery Order' : 'Takeaway Order')
                      : `Table ${initialTable.tableNumber}`)
                    : 'Sale Order'}
                </Title>
              </div>
            </TitleGroup>
          </HeaderLeft>

          <HeaderModeSwitch>
            {kitchenEnabled && (
              <ModeToggleBtn
                $active={activeOrderMode === 'kitchen'}
                $themeColor="#f97316"
                onClick={() => setOrderMode('kitchen')}
              >
                Kitchen
              </ModeToggleBtn>
            )}
            <ModeToggleBtn 
              $active={activeOrderMode === 'settle'}
              $themeColor="#16a34a" 
              onClick={() => setOrderMode('settle')}
            >
              Settle
            </ModeToggleBtn>
          </HeaderModeSwitch>

          <HeaderModeSwitch style={{ marginLeft: '4px' }}>
            <ModeToggleBtn 
              $active={productListingOn} 
              $themeColor={THEME.main}
              onClick={() => handleToggleProductListing(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Standard View"
            >
              <FaTh size={11} /> Standard
            </ModeToggleBtn>
            <ModeToggleBtn 
              $active={!productListingOn} 
              $themeColor={THEME.main}
              onClick={() => handleToggleProductListing(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Counter View"
            >
              <FaList size={11} /> Counter
            </ModeToggleBtn>
          </HeaderModeSwitch>

          {/* Sales History shortcut */}
          <HeaderShortcutBtn
            type="button"
            onClick={() => router.push('/owner/orders?tab=completed')}
            style={{ flexShrink: 0 }}
            $themeColor={THEME.main}
            $themeColorDark={THEME.dark}
          >
            <FaHistory size={13} />
            <HeaderShortcutLabel>Sales History</HeaderShortcutLabel>
          </HeaderShortcutBtn>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '280px', flex: '1 1 auto' }} onClick={e => e.stopPropagation()}>
            <PremiumDateTimePicker 
              value={orderDateTime}
              onChange={(val, meta) => {
                setOrderDateTime(val);
                if (meta?.isNow) {
                  setIsDateTimeManuallyEdited(false);
                } else {
                  setIsDateTimeManuallyEdited(true);
                }
              }}
              themeColor={THEME.main}
            />
          </div>


        </CounterHeader>

        <MainLayout>
          {loadError ? (
            <OfflineNotice>{loadError}</OfflineNotice>
          ) : (
          <>
          <CatalogSection>
            <CatalogToolbar>
              <SearchBar>
                <SearchIcon><FaSearch/></SearchIcon>
                <SearchInput 
                  ref={searchRef}
                  placeholder="Search menu items..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)}
                  $themeColor={THEME.main}
                />
                {!productListingOn && search.trim() !== '' && (
                  <FloatingSuggestBox>
                    {standardMatches.length > 0 ? (
                      <SuggestList>
                        {standardMatches.map(p => {
                          const quantity = productCartQuantity(p);
                          const hasOptions = hasExtendedOptions(p);
                          return (
                            <SuggestItem
                              key={p.id}
                              onClick={() => addFromStandardSearch(p)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  addFromStandardSearch(p);
                                }
                              }}
                            >
                              <SuggestItemMeta>
                                <strong>{p.name}</strong>
                                <span>{p.categoryName || 'Menu item'} • {hasOptions ? 'Options' : `₹${Number(p.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}`}</span>
                              </SuggestItemMeta>
                              {hasOptions ? (
                                <SuggestAddBtn $themeColor={THEME.main} $outline>
                                  {quantity > 0 && <VariantCount $themeColor={THEME.main} style={{ height: 16, width: 16, fontSize: 10 }}>{quantity}</VariantCount>}
                                  Options <FaChevronRight style={{ fontSize: 10 }} />
                                </SuggestAddBtn>
                              ) : quantity > 0 ? (
                                <SuggestStepper onClick={(e) => e.stopPropagation()}>
                                  <SuggestQtyBtn onClick={(event) => decrementProduct(event, p)}><FaMinus /></SuggestQtyBtn>
                                  <SuggestQtyVal>{quantity}</SuggestQtyVal>
                                  <SuggestQtyBtn onClick={(event) => incrementProduct(event, p)}><FaPlus /></SuggestQtyBtn>
                                </SuggestStepper>
                              ) : (
                                <SuggestAddIcon $themeColor={THEME.main}><FaPlus /></SuggestAddIcon>
                              )}
                            </SuggestItem>
                          );
                        })}
                      </SuggestList>
                    ) : (
                      <NoSuggests>No matching menu items found</NoSuggests>
                    )}
                  </FloatingSuggestBox>
                )}
              </SearchBar>

              <AddProductButton
                type="button" 
                onClick={startNewProductForPopup}
                $themeColor={THEME.main}
              >
                <FaPlus size={10} /> Add Product
              </AddProductButton>
            </CatalogToolbar>

            {isStandardUi ? (
              <StandardWorkspace>
                <StandardSearchPanel>
                  {standardMatches.length > 0 ? (
                    <StandardResults>
                      {standardMatches.map(p => {
                        const hasOptions = hasExtendedOptions(p);
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
                              <span>{p.categoryName || 'Menu item'} • {hasOptions ? 'Options available' : `₹${Number(p.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}`}</span>
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

                <StandardCurrentOrder style={{ display: 'flex', flexDirection: 'row' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {productListingOn && (
                      <StandardOrderHeader>
                        <Title style={{ fontSize: '18px' }}>Current Order</Title>
                        <CatBtn $themeColor={THEME.main} onClick={() => searchRef.current?.focus()}>
                          <FaPlus style={{ marginRight: 8 }} /> Product
                        </CatBtn>
                      </StandardOrderHeader>
                    )}
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ fontWeight: 700, fontSize: '11.5px', color: '#1e293b', lineHeight: '1.25', wordBreak: 'break-word', minWidth: 0, flex: 1 }}>{item.displayName || item.name}</div>
                                <button 
                                  type="button" 
                                  onClick={() => handleEditProductFromCart(item)}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '2px',
                                    borderRadius: '4px',
                                    transition: 'all 0.15s',
                                    flexShrink: 0
                                  }}
                                  onMouseOver={e => { e.currentTarget.style.color = THEME.main; e.currentTarget.style.background = '#f1f5f9'; }}
                                  onMouseOut={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }}
                                  title="Edit Product"
                                >
                                  <FaEdit size={10} />
                                </button>
                              </div>
                              <div style={{ color: '#64748b', fontWeight: 600, fontSize: '10.5px' }}>
                                ₹{Number(item.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)} each
                                {discountsEnabled && ((item.discount_percent > 0) || (item.discount_amount > 0)) && (
                                  <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '6px', fontSize: '9.5px', whiteSpace: 'nowrap' }}>
                                    (-{item.discount_percent > 0 ? `${item.discount_percent}%` : `₹${Number(item.discount_amount || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}`})
                                  </span>
                                )}
                              </div>
                            </div>
                            <QtyGroup style={{ margin: '0 4px' }}>
                              <QtyBtn onClick={() => updateQty(cartKeyFor(item), -1)}><FaMinus /></QtyBtn>
                              <div style={{ fontWeight: 800, minWidth: '14px', textAlign: 'center', fontSize: '10.5px', color: '#0f172a' }}>{item.qty}</div>
                              <QtyBtn onClick={() => updateQty(cartKeyFor(item), 1)}><FaPlus /></QtyBtn>
                            </QtyGroup>
                            <div style={{ color: THEME.main, fontWeight: 800, fontSize: '12px', minWidth: '50px', textAlign: 'right' }}>
                              ₹{(Number(item.price || 0) * item.qty).toFixed(config?.currencyDecimalPlaces ?? 2)}
                            </div>
                          </StandardOrderRow>
                        ))
                      )}
                    </StandardOrderList>
                  </div>

                  {!productListingOn && (
                    <div style={{ width: '220px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', padding: '10px 12px', gap: '8px', justifyContent: 'space-between', height: '100%', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }} className="custom-scrollbar">
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>Payment Info</div>
                        
                        {renderCustomerSelectionPanel()}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Gross Total</div>
                          <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 800 }}>₹{totals.line_subtotal.toFixed(config?.currencyDecimalPlaces ?? 2)}</div>
                        </div>

                        {totals.discount_amount > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>Discount</div>
                            <div style={{ fontSize: '12.5px', color: '#dc2626', fontWeight: 800 }}>-₹{totals.discount_amount.toFixed(config?.currencyDecimalPlaces ?? 2)}</div>
                          </div>
                        )}

                        {config?.taxEnabled && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Subtotal</div>
                            <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 800 }}>₹{totals.taxable_amount.toFixed(config?.currencyDecimalPlaces ?? 2)}</div>
                          </div>
                        )}
                        
                        {config?.taxEnabled && (totals.total_tax_added > 0 || totals.total_tax_included > 0) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Tax Amount</div>
                            <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 800 }}>₹{(totals.total_tax_added + totals.total_tax_included).toFixed(config?.currencyDecimalPlaces ?? 2)}</div>
                          </div>
                        )}
                        
                        {config?.roundOffEnabled && config?.roundOffMode === 'automatic' && roundOffPreview !== 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Round Off</div>
                            <div style={{ fontSize: '12.5px', color: '#94a3b8', fontWeight: 700 }}>{(roundOffPreview > 0 ? '+' : '')}₹{Math.abs(roundOffPreview).toFixed(config?.currencyDecimalPlaces ?? 2)}</div>
                          </div>
                        )}
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'white', padding: '8px 10px', borderRadius: '8px', border: '1px solid #edf2f7' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Grand Total</div>
                          <div style={{ fontSize: '15px', color: THEME.main, fontWeight: 900 }}>₹{totals.total_inc_tax.toFixed(config?.currencyDecimalPlaces ?? 2)}</div>
                        </div>
                      </div>
                      
                      <div style={{ flexShrink: 0 }}>
                        {discountsEnabled && activeOrderMode === 'settle' && (
                          <DiscountBtn type="button" onClick={() => setShowDiscountModal(true)} style={{ marginBottom: '10px', height: '36px' }}>
                            {totals.discount_amount > 0 ? `Edit Discounts (₹${totals.discount_amount.toFixed(config?.currencyDecimalPlaces ?? 2)})` : 'Apply Discount'}
                          </DiscountBtn>
                        )}

                        <PayBtn 
                          $color={THEME.main} 
                          $colorDark={THEME.dark} 
                          disabled={cart.length === 0 || processing}
                          onClick={activeOrderMode === 'kitchen' ? handlePlaceOrder : handleCompleteSettle}
                          style={{ height: '42px', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '8px', width: '100%', fontSize: '13px', fontWeight: '800', margin: 0 }}
                        >
                          {processing ? 'Processing...' : (
                            <>
                              {activeOrderMode === 'kitchen' ? <FaFire/> : <FaWallet/>}
                              <span style={{ marginLeft: '6px' }}>
                                {activeOrderMode === 'kitchen' ? 'Send to Kitchen' : 'Complete Sale'}
                              </span>
                            </>
                          )}
                        </PayBtn>
                      </div>
                    </div>
                  )}
                </StandardCurrentOrder>
              </StandardWorkspace>
            ) : (
              <>
                {productListingOn ? (
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
                      const hasOptions = hasExtendedOptions(p);
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
                              <ProdPrice $themeColor={THEME.main}>₹{Number(p.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}{hasOptions ? '+' : ''}</ProdPrice>
                              {hasOptions ? (
                                <AddBtn $themeColor={THEME.main} $outline>
                                  {quantity > 0 && <VariantCount $themeColor={THEME.main}>{quantity}</VariantCount>}
                                  Options <FaChevronRight style={{ fontSize: '9px' }} />
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
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '12px', marginTop: '8px' }}>
                    <CounterSplitGrid>
                      
                      {/* Left Column: Scrollable Cart list */}
                      <CounterCartListPanel>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {cart.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#64748b', padding: '30px 16px' }}>
                              <FaUtensils size={36} style={{ opacity: 0.18, marginBottom: 12 }} />
                              <div style={{ fontWeight: 800, color: '#475569', fontSize: '16px' }}>Empty Cart</div>
                              <div style={{ fontSize: '12px', marginTop: 4 }}>Search or scan above to add items to your order</div>
                            </div>
                          ) : (
                            cart.map(item => (
                              <div key={cartKeyFor(item)} style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '5px 10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #edf2f7' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '11.5px', color: '#1e293b', lineHeight: '1.25', wordBreak: 'break-word', minWidth: 0, flex: 1 }}>{item.displayName || item.name}</div>
                                    <button 
                                      type="button" 
                                      onClick={() => handleEditProductFromCart(item)}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#64748b',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '2px',
                                        borderRadius: '4px',
                                        transition: 'all 0.15s',
                                        flexShrink: 0
                                      }}
                                      onMouseOver={e => { e.currentTarget.style.color = THEME.main; e.currentTarget.style.background = '#f1f5f9'; }}
                                      onMouseOut={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }}
                                      title="Edit Product"
                                    >
                                      <FaEdit size={10} />
                                    </button>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '1px', flexShrink: 0 }}>
                                    <button type="button" onClick={() => updateQty(cartKeyFor(item), -1)} style={{ border: 0, background: 'transparent', width: 16, height: 16, borderRadius: '3px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}><FaMinus size={6}/></button>
                                    <div style={{ fontWeight: 800, minWidth: '14px', textAlign: 'center', fontSize: '10px', color: '#0f172a' }}>{item.qty}</div>
                                    <button type="button" onClick={() => updateQty(cartKeyFor(item), 1)} style={{ border: 0, background: 'transparent', width: 16, height: 16, borderRadius: '3px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}><FaPlus size={6}/></button>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '1px' }}>
                                  <div style={{ color: '#64748b', fontWeight: 600, fontSize: '10.5px' }}>
                                    ₹{Number(item.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)} each
                                    {discountsEnabled && ((item.discount_percent > 0) || (item.discount_amount > 0)) && (
                                      <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '6px', fontSize: '9.5px', whiteSpace: 'nowrap' }}>
                                        (-{item.discount_percent > 0 ? `${item.discount_percent}%` : `₹${Number(item.discount_amount || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}`})
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ color: THEME.main, fontWeight: 800, fontSize: '12px', textAlign: 'right' }}>
                                    ₹{(Number(item.price || 0) * Number(item.qty || 0)).toFixed(config?.currencyDecimalPlaces ?? 2)}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </CounterCartListPanel>
 
                      {/* Right Column: Calculations vertical section */}
                      <CounterCalculationsPanel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }} className="custom-scrollbar">
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>Summary Info</div>
                          
                          {renderCustomerSelectionPanel()}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'white', padding: '8px 10px', borderRadius: '8px', border: '1px solid #edf2f7', boxShadow: '0 4px 12px rgba(15,23,42,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>Gross Total</span>
                              <span style={{ color: '#0f172a', fontWeight: 700 }}>₹{totals.line_subtotal.toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
                            </div>

                            {totals.discount_amount > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: '#dc2626' }}>
                                <span style={{ fontWeight: 600 }}>Discount</span>
                                <span style={{ fontWeight: 700 }}>-₹{totals.discount_amount.toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
                              </div>
                            )}

                            {config?.taxEnabled && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
                                <span style={{ color: '#64748b', fontWeight: 600 }}>Subtotal</span>
                                <span style={{ color: '#0f172a', fontWeight: 700 }}>₹{totals.taxable_amount.toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
                              </div>
                            )}
                            
                            {config?.taxEnabled && (totals.total_tax_added > 0 || totals.total_tax_included > 0) && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
                                <span style={{ color: '#64748b', fontWeight: 600 }}>Tax Amount</span>
                                <span style={{ color: '#0f172a', fontWeight: 700 }}>₹{(totals.total_tax_added + totals.total_tax_included).toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
                              </div>
                            )}

                            {config?.roundOffEnabled && config?.roundOffMode === 'automatic' && roundOffPreview !== 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Round Off</span>
                                <span style={{ color: '#94a3b8', fontWeight: 700 }}>{(roundOffPreview > 0 ? '+' : '')}₹{Math.abs(roundOffPreview).toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
                              </div>
                            )}
                            
                            <div style={{ height: '1px', borderTop: '1px dashed #cbd5e1', margin: '4px 0' }} />
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '12px' }}>Grand Total</span>
                              <span style={{ color: THEME.main, fontWeight: 900, fontSize: '16px' }}>₹{totals.total_inc_tax.toFixed(config?.currencyDecimalPlaces ?? 2)}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                          {discountsEnabled && activeOrderMode === 'settle' && (
                            <DiscountBtn type="button" onClick={() => setShowDiscountModal(true)}>
                              {totals.discount_amount > 0 ? `Edit Discounts (₹${totals.discount_amount.toFixed(config?.currencyDecimalPlaces ?? 2)})` : 'Apply Discount'}
                            </DiscountBtn>
                          )}
                          
                          <PayBtn 
                            $color={THEME.main} 
                            $colorDark={THEME.dark} 
                            disabled={cart.length === 0 || processing}
                            onClick={activeOrderMode === 'kitchen' ? handlePlaceOrder : handleCompleteSettle}
                            style={{ height: '44px', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '8px', width: '100%', fontSize: '14px', fontWeight: '800', margin: 0 }}
                          >
                            {processing ? 'Processing...' : (
                              <>
                                {activeOrderMode === 'kitchen' ? <FaFire/> : <FaWallet/>}
                                <span style={{ marginLeft: '8px' }}>
                                  {activeOrderMode === 'kitchen' ? 'Send to Kitchen' : 'Complete Sale'}
                                </span>
                              </>
                            )}
                          </PayBtn>
                        </div>
                      </CounterCalculationsPanel>

                    </CounterSplitGrid>
                  </div>
                )}
              </>
            )}
          </CatalogSection>

          {mobileCartOpen && <MobileCartBackdrop onClick={() => setMobileCartOpen(false)} />}
          {productListingOn && (
            <>
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

            {renderCustomerSelectionPanel()}

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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '11.5px', color: '#1e293b', lineHeight: '1.25', wordBreak: 'break-word', minWidth: 0, flex: 1 }}>{item.displayName || item.name}</div>
                        <button 
                          type="button" 
                          onClick={() => handleEditProductFromCart(item)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#64748b',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px',
                            borderRadius: '4px',
                            transition: 'all 0.15s',
                            flexShrink: 0
                          }}
                          onMouseOver={e => { e.currentTarget.style.color = THEME.main; e.currentTarget.style.background = '#f1f5f9'; }}
                          onMouseOut={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }}
                          title="Edit Product"
                        >
                          <FaEdit size={10} />
                        </button>
                      </div>
                      <QtyGroup>
                        <QtyBtn onClick={() => updateQty(cartKeyFor(item), -1)}><FaMinus/></QtyBtn>
                        <div style={{ fontWeight: 800, minWidth: '14px', textAlign: 'center', fontSize: '10.5px', color: '#0f172a' }}>{item.qty}</div>
                        <QtyBtn onClick={() => updateQty(cartKeyFor(item), 1)}><FaPlus/></QtyBtn>
                      </QtyGroup>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '1px' }}>
                      <div style={{ color: '#64748b', fontWeight: 600, fontSize: '10.5px' }}>
                        ₹{Number(item.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)} each
                        {discountsEnabled && ((item.discount_percent > 0) || (item.discount_amount > 0)) && (
                          <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '6px', fontSize: '9.5px', whiteSpace: 'nowrap' }}>
                            (-{item.discount_percent > 0 ? `${item.discount_percent}%` : `₹${Number(item.discount_amount || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}`})
                          </span>
                        )}
                      </div>
                      <div style={{ color: THEME.main, fontWeight: 800, fontSize: '12px', textAlign: 'right' }}>
                        ₹{(Number(item.price || 0) * Number(item.qty || 0)).toFixed(config?.currencyDecimalPlaces ?? 2)}
                      </div>
                    </div>
                  </CartItemCard>
                ))
              )}
            </CartBody>

            <CartFooter>
              <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <SummaryRow><span>Gross Total</span><span>₹{totals.line_subtotal.toFixed(config?.currencyDecimalPlaces ?? 2)}</span></SummaryRow>
                {totals.discount_amount > 0 && (
                  <SummaryRow style={{ color: '#dc2626' }}><span>Discount</span><span>-₹{totals.discount_amount.toFixed(config?.currencyDecimalPlaces ?? 2)}</span></SummaryRow>
                )}
                {config?.taxEnabled && (
                  <SummaryRow><span>Subtotal</span><span>₹{totals.taxable_amount.toFixed(config?.currencyDecimalPlaces ?? 2)}</span></SummaryRow>
                )}
                {config?.taxEnabled && (totals.total_tax_added > 0 || totals.total_tax_included > 0) && (
                  <SummaryRow><span>Tax Amount</span><span>₹{(totals.total_tax_added + totals.total_tax_included).toFixed(config?.currencyDecimalPlaces ?? 2)}</span></SummaryRow>
                )}
                {config?.roundOffEnabled && config?.roundOffMode === 'automatic' && roundOffPreview !== 0 && (
                  <SummaryRow style={{ color: '#94a3b8' }}><span>Round Off</span><span>{(roundOffPreview > 0 ? '+' : '')}₹{Math.abs(roundOffPreview).toFixed(config?.currencyDecimalPlaces ?? 2)}</span></SummaryRow>
                )}
                <div style={{ height: '1px', background: '#e2e8f0', margin: '8px 0' }}/>
                <SummaryRow $bold><span>Grand Total</span><span>₹{totals.total_inc_tax.toFixed(config?.currencyDecimalPlaces ?? 2)}</span></SummaryRow>
              </div>

              {discountsEnabled && activeOrderMode === 'settle' && (
                <DiscountBtn type="button" onClick={() => setShowDiscountModal(true)} style={{ marginBottom: '10px' }}>
                  {totals.discount_amount > 0 ? `Edit Discounts (₹${totals.discount_amount.toFixed(config?.currencyDecimalPlaces ?? 2)})` : 'Apply Discount'}
                </DiscountBtn>
              )}

              <PayBtn 
                $color={THEME.main} 
                $colorDark={THEME.dark} 
                disabled={cart.length === 0 || processing}
                onClick={activeOrderMode === 'kitchen' ? handlePlaceOrder : handleCompleteSettle}
              >
                {processing ? 'Processing...' : (
                  <>
                    {activeOrderMode === 'kitchen' ? <FaFire/> : <FaWallet/>}
                    {activeOrderMode === 'kitchen' ? 'Send to Kitchen' : 'Complete Sale'}
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
              <FaShoppingBag /> View Cart <span>|</span> {cartCountLabel} <span>|</span> ₹{Number(totals.total_amount || 0).toFixed(config?.currencyDecimalPlaces ?? 2)}
            </MobileCartToggle>
          )}
          </>
          )}
          </>
          )}
        </MainLayout>
        <CreditCustomerQuickCreateModal
          open={showNewCreditCustomer}
          themeColor="#14b8a6"
          onClose={() => setShowNewCreditCustomer(false)}
          onCreated={handleCreditCustomerCreated}
        />
        {variantLoading && <OfflineNotice style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>Loading item options...</OfflineNotice>}
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
        {discountsEnabled && showDiscountModal && (
          <ModalBackdrop onClick={() => setShowDiscountModal(false)}>
            <DiscountModalContent onClick={e => e.stopPropagation()}>
              <DiscountModalHeader>
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(false)}
                  style={{
                    border: 'none',
                    background: '#f1f5f9',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#64748b',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                  onMouseOut={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                  aria-label="Close discounts modal"
                >
                  <FaTimes size={10} />
                </button>
              </DiscountModalHeader>
              <DiscountTabHeader>
                <DiscountTabButton
                  type="button"
                  $active={discountModalTab === 'line'}
                  $themeColor={THEME.main}
                  onClick={() => setDiscountModalTab('line')}
                >
                  Line Discounts
                </DiscountTabButton>
                <DiscountTabButton
                  type="button"
                  $active={discountModalTab === 'total'}
                  $themeColor={THEME.main}
                  onClick={() => setDiscountModalTab('total')}
                >
                  Total Discount
                </DiscountTabButton>
              </DiscountTabHeader>
              <DiscountModalBody>
                {discountModalTab === 'line' ? (
                  cart.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>
                      Add items to your cart first to apply discounts.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {cart.map(item => {
                        const key = cartKeyFor(item);
                        const disc = localDiscounts[key] || { type: 'amount', value: 0 };
                        return (
                          <DiscountRow key={key}>
                            <DiscountRowInfo>
                              <span>{item.displayName || item.name}</span>
                              <small>₹{Number(item.price || 0).toFixed(config?.currencyDecimalPlaces ?? 2)} x {item.qty}</small>
                            </DiscountRowInfo>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DiscountInputWrapper $themeColor={THEME.main}>
                                <input 
                                  type="number"
                                  min="0"
                                  max={disc.type === 'percentage' ? 100 : undefined}
                                  value={disc.value || ''}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setLocalDiscounts(prev => ({
                                      ...prev,
                                      [key]: { ...prev[key], value: val }
                                    }));
                                  }}
                                  style={{
                                    border: 'none',
                                    outline: 'none',
                                    width: '60px',
                                    padding: '0 4px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    textAlign: 'right',
                                    color: '#000000'
                                  }}
                                />
                              </DiscountInputWrapper>
                              <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                                <DiscUnitToggle 
                                  type="button"
                                  $active={disc.type === 'amount'} 
                                  $themeColor={THEME.main}
                                  onClick={() => {
                                    setLocalDiscounts(prev => ({
                                      ...prev,
                                      [key]: { ...prev[key], type: 'amount' }
                                    }));
                                  }}
                                >
                                  ₹
                                </DiscUnitToggle>
                                <DiscUnitToggle 
                                  type="button"
                                  $active={disc.type === 'percentage'} 
                                  $themeColor={THEME.main}
                                  onClick={() => {
                                    setLocalDiscounts(prev => ({
                                      ...prev,
                                      [key]: { ...prev[key], type: 'percentage' }
                                    }));
                                  }}
                                >
                                  %
                                </DiscUnitToggle>
                              </div>
                            </div>
                          </DiscountRow>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div style={{ padding: '16px 0' }}>
                    <DiscountRow style={{ background: '#f8fafc', borderColor: '#edf2f7', justifyContent: 'space-between', padding: '12px 16px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>Total Discount</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <DiscountInputWrapper $themeColor={THEME.main}>
                          <input 
                            type="number"
                            min="0"
                            max={localOrderDiscountType === 'percentage' ? 100 : undefined}
                            value={localOrderDiscountValue || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setLocalOrderDiscountValue(val);
                            }}
                            style={{
                              border: 'none',
                              outline: 'none',
                              width: '60px',
                              padding: '0 4px',
                              fontSize: '13px',
                              fontWeight: '700',
                              textAlign: 'right',
                              color: '#000000',
                              background: 'transparent'
                            }}
                          />
                        </DiscountInputWrapper>
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                          <DiscUnitToggle 
                            type="button"
                            $active={localOrderDiscountType === 'amount'} 
                            $themeColor={THEME.main}
                            onClick={() => setLocalOrderDiscountType('amount')}
                          >
                            ₹
                          </DiscUnitToggle>
                          <DiscUnitToggle 
                            type="button"
                            $active={localOrderDiscountType === 'percentage'} 
                            $themeColor={THEME.main}
                            onClick={() => setLocalOrderDiscountType('percentage')}
                          >
                            %
                          </DiscUnitToggle>
                        </div>
                      </div>
                    </DiscountRow>
                  </div>
                )}
              </DiscountModalBody>
              <DiscountModalFooter>
                <button 
                  type="button"
                  onClick={handleClearAllDiscounts} 
                  style={{
                    flex: 1, 
                    height: '36px', 
                    borderRadius: '8px', 
                    border: '1px solid #cbd5e1', 
                    background: 'white', 
                    fontWeight: '700', 
                    fontSize: '13px',
                    color: '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  Clear All
                </button>
                <button 
                  type="button"
                  onClick={handleApplyDiscounts}
                  style={{
                    flex: 1, 
                    height: '36px', 
                    borderRadius: '8px', 
                    border: 'none', 
                    background: THEME.main, 
                    fontWeight: '700', 
                    fontSize: '13px',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
              </DiscountModalFooter>
            </DiscountModalContent>
          </ModalBackdrop>
        )}
        {selectedProductForPopup && (
          <ProductManagementPopup
            product={selectedProductForPopup}
            viewOnly={popupViewOnly}
            onClose={() => { setSelectedProductForPopup(null); setPopupViewOnly(false); }}
            onSaveSuccess={refreshProductsList}
          />
        )}
        {/* ─── Settle PaymentDialog: shown BEFORE order creation ─── */}
        {showSettleDialog && (
          <PaymentDialog
            order={{
              // Pass a synthetic "order" with current cart totals so PaymentDialog
              // can re-calculate the breakdown and round-off correctly
              lines: cart.map((item, idx) => ({
                productId: item.productId || item.id,
                productName: item.displayName || item.name || 'Item',
                unitPrice: item.price,
                quantity: item.qty,
                taxRate: (item.taxRate !== undefined && item.taxRate !== null && item.taxRate !== '') ? Number(item.taxRate) : null,
                isPackagedGood: item.isPackagedGood === true || item.is_packaged_good === true,
                discountAmount: item.discount_amount || 0,
                discountPercent: item.discount_percent || 0,
                discount: item.discount,
              })),
              orderDiscount: discountsEnabled ? { type: discountType, value: discountValue } : { type: 'amount', value: 0 },
              grandTotal: totals.total_inc_tax,
              totalTaxAmount: totals.total_tax,
              totalDiscountAmount: totals.discount_amount,
              totalAmount: totals.total_inc_tax,
              orderNo: '(new)',
              tableNumber: initialTable?.tableNumber || 'Counter',
            }}
            loading={processing}
            config={config}
            creditCustomers={initialCreditCustomers || []}
            onClose={() => setShowSettleDialog(false)}
            onConfirm={(paymentPayload) => {
              setShowSettleDialog(false);
              handlePlaceOrder(paymentPayload);
            }}
            onCreditCustomerCreated={onCreditCustomerCreated}
            themeColor="green"
            disableEditDiscount={true}
          />
        )}
      </ModalContent>
    </ModalOverlay>
  );
}
