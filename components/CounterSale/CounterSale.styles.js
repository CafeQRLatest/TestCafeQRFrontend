import styled, { keyframes } from 'styled-components';

export const CsFadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const CsModalOverlay = styled.div`
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  zoom: ${props => props.$zoom || 1};
`;

export const CsModalContent = styled.div`
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

export const CsCounterHeader = styled.header`
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

export const CsHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;

  @media (max-width: 520px) {
    gap: 8px;
  }
`;

export const CsBackBtn = styled.button`
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

export const CsTitleGroup = styled.div`
  display: flex;
  align-items: center;
  border-left: 5px solid ${props => props.$accentColor || '#16a34a'};
  border-radius: 3px;
  padding: 0 0 0 10px;
  min-width: 0;
  height: 24px;
`;

export const CsTitle = styled.h1`
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

export const CsSubtitle = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
`;

export const CsMainLayout = styled.main`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  width: 100%;
  min-width: 0;

  @media (max-width: 900px) {
    display: block;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
`;

export const CsCatalogSection = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: clamp(12px, 1.4vw, 20px);
  gap: clamp(10px, 1.2vw, 18px);
  min-width: 0;
  min-height: 0;

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

export const CsCartSection = styled.aside`
  width: clamp(270px, 22vw, 360px);
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0,0,0,0.02);
  min-height: 0;

  @media (max-width: 900px) {
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

export const CsHeaderModeSwitch = styled.div`
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

export const CsZoomControl = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 9px;
  box-shadow: inset 0 1px 2.5px rgba(15, 23, 42, 0.08);
  border: 1.5px solid #edf2f7;
  flex-shrink: 0;
`;

export const CsZoomBtn = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: white;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${props => props.$themeColor || '#ea580c'};
    background: ${props => props.$softColor || '#fff7ed'};
    color: ${props => props.$themeColor || '#ea580c'};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

export const CsZoomLabel = styled.span`
  font-size: 10.5px;
  font-weight: 800;
  color: #475569;
  padding: 0 4px;
  user-select: none;
  min-width: 34px;
  text-align: center;
`;

export const CsCategoryCarouselWrapper = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
  gap: 6px;
`;

export const CsScrollArrowBtn = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: white;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);

  &:hover:not(:disabled) {
    border-color: ${props => props.$themeColor || '#ea580c'};
    background: ${props => props.$softColor || '#fff7ed'};
    color: ${props => props.$themeColor || '#ea580c'};
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    box-shadow: none;
    border-color: #e2e8f0;
    background: #f8fafc;
    color: #94a3b8;
  }
`;

export const CsModeToggleBtn = styled.button`
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

export const CsHeaderShortcutBtn = styled.button`
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

export const CsHeaderShortcutLabel = styled.span`
  @media (max-width: 680px) {
    display: none;
  }
`;

export const CsSearchBar = styled.div`
  position: relative;
  width: 100%;
`;

export const CsCatalogToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  position: relative;
  flex: 0 0 auto;

  ${CsSearchBar} {
    flex: 1 1 320px;
    min-width: min(100%, 260px);
  }

  @media (max-width: 640px) {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;

    ${CsSearchBar} {
      flex-basis: auto;
      min-width: 0;
    }
  }
`;

export const CsAddProductButton = styled.button`
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

export const CsFloatingSuggestBox = styled.div`
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

export const CsSuggestList = styled.div`
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const CsSuggestItem = styled.div`
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

export const CsSuggestItemMeta = styled.div`
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

export const CsSuggestAddIcon = styled.div`
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

  ${CsSuggestItem}:hover & {
    background: ${props => props.$themeColor};
    color: white;
  }
`;

export const CsSuggestAddBtn = styled.button`
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

export const CsSuggestStepper = styled.div`
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 5px;
  padding: 1px;
  height: 20px;
`;

export const CsSuggestQtyBtn = styled.button`
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

export const CsSuggestQtyVal = styled.div`
  font-weight: 800;
  font-size: 10px;
  min-width: 16px;
  text-align: center;
  color: #0f172a;
`;

export const CsNoSuggests = styled.div`
  padding: 20px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
`;

export const CsSearchInput = styled.input`
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

export const CsSearchIcon = styled.div`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 16px;
`;

export const CsCategoryScroll = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 2px 6px;
  flex: 1;
  min-width: 0;
  scroll-padding-inline: 2px;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar { display: none; }
`;

export const CsCatBtn = styled.button`
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

export const CsFilterTabs = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 2px 4px;
  flex: 0 0 auto;
  scroll-padding-inline: 2px;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar { display: none; }
`;

export const CsFilterBtn = styled.button`
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

export const CsProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 6px 28px 2px;
  min-height: 0;
  width: 100%;
  min-width: 0;
  flex: 1;
  align-content: start;
  scrollbar-gutter: stable;

  @media (min-width: 1800px) {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }

  @media (min-width: 1281px) {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    overflow: visible;
    overflow-x: visible;
    padding-right: 0;
    scrollbar-gutter: auto;
    gap: 12px;
  }

  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }
`;

export const CsProductCard = styled.div`
  background: white;
  border-radius: 12px;
  border: 1px solid ${props => props.$inCart ? props.$themeColor : '#e2e8f0'};
  box-shadow: ${props => props.$inCart ? `0 4px 12px ${props.$themeColor}15` : '0 1px 3px rgba(0,0,0,0.02)'};
  padding: 0;
  display: grid;
  grid-template-rows: ${props => props.$noImage ? '1fr' : '80px 1fr'};
  gap: 0;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  overflow: hidden;
  font: inherit;
  min-height: ${props => props.$noImage ? '112px' : '210px'};
  position: relative;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
    border-color: ${props => props.$themeColor};
  }

  &:hover .desc-tooltip {
    transform: translateY(0);
  }

  @media (max-width: 640px) {
    border-radius: 8px;
    grid-template-rows: ${props => props.$noImage ? '1fr' : '68px 1fr'};
    min-height: ${props => props.$noImage ? '104px' : '190px'};

    &:hover {
      transform: none;
      box-shadow: none;
    }
  }
`;

export const CsProdImg = styled.div`
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
  border-bottom: 1px solid #f1f5f9;

  @media (max-width: 520px) {
    min-height: 0;
  }
`;

export const CsProductBody = styled.div`
  padding: 8px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
`;

export const CsVegBadge = styled.div`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 13px;
  height: 13px;
  border-radius: 4px;
  border: 1px solid ${props => props.$nonVeg ? '#dc2626' : '#16a34a'};
  background: white;
  color: ${props => props.$nonVeg ? '#dc2626' : '#16a34a'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 7px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
`;

export const CsCategoryTag = styled.span`
  width: fit-content;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 9px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.01em;
`;

export const CsProdNameWrapper = styled.div`
  position: relative;
  min-width: 0;
`;

export const CsNameTooltip = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-6px);
  background: ${props => props.$mode === 'kitchen' 
    ? 'linear-gradient(135deg, #ff843d, #f97316)' 
    : 'linear-gradient(135deg, #34d399, #059669)'};
  color: #ffffff;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  white-space: normal;
  width: max-content;
  max-width: 180px;
  z-index: 50;
  box-shadow: ${props => props.$mode === 'kitchen'
    ? '0 6px 16px rgba(249, 115, 22, 0.3), 0 2px 4px rgba(0, 0, 0, 0.08)'
    : '0 6px 16px rgba(5, 150, 105, 0.3), 0 2px 4px rgba(0, 0, 0, 0.08)'};
  pointer-events: none;
  text-align: center;
  line-height: 1.45;
  border: 1px solid ${props => props.$mode === 'kitchen' ? '#ff924d' : '#34d399'};

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 5px;
    border-style: solid;
    border-color: ${props => props.$mode === 'kitchen' ? '#f97316' : '#059669'} transparent transparent transparent;
  }
`;

export const CsProdName = styled.div`
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
  line-height: 1.3;
  min-height: 32px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
`;

export const CsProdPriceRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin-top: auto;
`;

export const CsProdPrice = styled.div`
  font-weight: 800;
  font-size: 15px;
  color: ${props => props.$themeColor};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
`;

export const CsAddBtn = styled.div`
  height: 28px;
  width: 100%;
  border-radius: 6px;
  background: ${props => props.$outline ? 'white' : props.$themeColor};
  border: 1px solid ${props => props.$themeColor};
  color: ${props => props.$outline ? props.$themeColor : 'white'};
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 700;
  transition: all 0.15s ease-in-out;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  flex-shrink: 0;

  &:hover {
    background: ${props => props.$outline ? `${props.$themeColor}0a` : props.$themeColor};
    transform: translateY(-0.5px);
  }
`;

export const CsProductStepper = styled.div`
  height: 28px;
  width: 100%;
  border-radius: 6px;
  border: 1px solid ${props => props.$themeColor};
  background: white;
  color: #0f172a;
  display: grid;
  grid-template-columns: 30px 1fr 30px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  flex-shrink: 0;
`;

export const CsProductQtyBtn = styled.button`
  border: 0;
  background: ${props => props.$themeColor}0d;
  color: ${props => props.$themeColor};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 9px;
  padding: 0;
  height: 100%;
  transition: background 0.15s;

  &:hover {
    background: ${props => props.$themeColor}1a;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

export const CsProductQtyValue = styled.input`
  border: none;
  outline: none;
  background: transparent;
  width: 100%;
  height: 100%;
  text-align: center;
  font-weight: 850;
  font-size: 13.5px;
  color: #0f172a;
  padding: 0;
  margin: 0;
  
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type=number] {
    -moz-appearance: textfield;
  }
`;

export const CsVariantCount = styled.span`
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

export const CsCartHeader = styled.div`
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  @media (max-width: 900px) {
    padding: 8px 12px;
  }
`;

export const CsCartBody = styled.div`
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

export const CsCartFooter = styled.div`
  padding: 10px 14px;
  border-top: 1px solid #e2e8f0;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 6px;

  @media (max-width: 900px) {
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  }

  @media (max-width: 520px) {
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
  }
`;

export const CsSummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-weight: ${props => props.$bold ? '800' : '600'};
  font-size: ${props => props.$bold ? '16px' : '11.5px'};
  color: ${props => props.$bold ? '#0f172a' : '#64748b'};
`;

export const CsPayBtn = styled.button`
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

export const CsDiscountBtn = styled.button`
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

export const CsModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const CsDiscountModalContent = styled.div`
  background: white;
  width: min(480px, 94vw);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ${CsFadeIn} 0.2s ease-out;
`;

export const CsDiscountModalHeader = styled.div`
  padding: 8px 12px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

export const CsDiscountTabHeader = styled.div`
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #edf2f7;
  padding: 0 16px;
`;

export const CsDiscountTabButton = styled.button`
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

export const CsDiscountModalBody = styled.div`
  padding: 16px 20px;
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const CsDiscountModalFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #edf2f7;
  display: flex;
  gap: 10px;
`;

export const CsDiscountRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f8fafc;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #edf2f7;
`;

export const CsDiscountRowInfo = styled.div`
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

export const CsDiscountInputWrapper = styled.div`
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

export const CsDiscUnitToggle = styled.button`
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

export const CsEmptyCart = styled.div`
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

export const CsCartItemCard = styled.div`
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


export const CsQtyGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  background: #f8fafc;
  padding: 1.5px 4px;
  border-radius: 4px;
  flex: 0 0 auto;
`;

export const CsQtyBtn = styled.button`
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

export const CsCartCloseBtn = styled.button`
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

export const CsMobileCartBackdrop = styled.div`
  display: none;

  @media (max-width: 900px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.38);
    z-index: 1000;
  }
`;

export const CsMobileCartToggle = styled.button`
  display: none;

  @media (max-width: 900px) {
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

export const CsOfflineNotice = styled.div`
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

export const CsCounterSplitGrid = styled.div`
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

export const CsCounterCartListPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  @media (max-width: 768px) {
    min-height: 250px;
    max-height: 380px;
  }
`;

export const CsCounterCalculationsPanel = styled.div`
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

export const CsCustomerPickerArea = styled.div`
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

export const CsCustomerInputWrap = styled.div`
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

export const CsCustomerInput = styled.input`
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


export const CsCustomerDropdown = styled.div`
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

export const CsCustomerOption = styled.button`
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

export const CsCustomerName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
`;

export const CsCustomerPhone = styled.span`
  font-size: 12px;
  color: #64748b;
`;

export const CsCustomerChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const CsCustomerChip = styled.div`
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

export const CsRemoveChip = styled.button`
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

export const CsDescriptionTooltip = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.96);
  color: white;
  padding: 10px 12px;
  font-size: 11px;
  line-height: 1.45;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  max-height: 100%;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 4px;

  ${props => props.$visible && `
    transform: translateY(0);
  `}

  .desc-title {
    font-weight: 700;
    font-size: 12px;
    color: #f97316;
  }

  .desc-text {
    font-weight: 500;
    color: #e2e8f0;
  }
  
  .desc-close {
    align-self: flex-end;
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    cursor: pointer;
    padding: 3px 8px;
    margin-top: 4px;
    transition: all 0.15s;
    &:hover {
      background: rgba(255,255,255,0.15);
      color: #fff;
    }
  }
`;

