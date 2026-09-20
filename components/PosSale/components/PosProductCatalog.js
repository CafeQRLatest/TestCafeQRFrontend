import React, { useRef, useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { FaPlus, FaMinus, FaSearch, FaCamera, FaBarcode, FaFire, FaLeaf, FaTimes, FaLayerGroup, FaChevronRight } from 'react-icons/fa';
import PosProductCard from './PosProductCard';
import PosCategoryFilter from './PosCategoryFilter';
import { hasExtendedOptions } from '../../CounterSale/domain/cart';
import * as S from '../../CounterSale/CounterSale.styles';

// ── Styled Components ──

const CatalogContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: ${props => props.$productListingOn ? '1' : '0 0 auto'};
  height: ${props => props.$productListingOn ? '100%' : 'auto'};
  min-height: 0;
  width: 100%;
  overflow: ${props => props.$productListingOn ? 'hidden' : 'visible'};
  background: white;
  border-radius: ${props => props.$productListingOn ? '16px' : '0'};
  border: ${props => props.$productListingOn ? '1px solid #e2e8f0' : 'none'};
`;

const HeaderToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: white;
  border-bottom: 1px solid #f1f5f9;
  position: relative;

  @media (max-width: 640px) {
    padding: 8px 10px;
    gap: 8px;
  }
`;

const SearchWrapper = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
`;

const SearchInput = styled.input`
  width: 100%;
  height: 42px;
  padding: 0 105px 0 46px;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font-size: 13.5px;
  font-weight: 500;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);

  &:hover {
    background: #ffffff;
    border-color: #cbd5e1;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05);
  }

  &:focus {
    background: #ffffff;
    border-color: ${props => props.$themeColor || '#f97316'};
    box-shadow: 0 0 0 3.5px ${props => props.$themeColor ? `${props.$themeColor}22` : 'rgba(249, 115, 22, 0.16)'}, 0 3px 10px rgba(15, 23, 42, 0.06);
  }

  &::placeholder {
    color: #94a3b8;
    font-weight: 400;
  }

  @media (max-width: 640px) {
    height: 38px;
    padding: 0 70px 0 34px;
    font-size: 12px;
  }
`;

const SearchIconBox = styled.div`
  position: absolute;
  left: 8px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: ${props => props.$focused 
    ? (props.$themeColor ? `${props.$themeColor}18` : '#fff7ed') 
    : '#f1f5f9'};
  color: ${props => props.$focused ? (props.$themeColor || '#f97316') : '#64748b'};
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  @media (max-width: 640px) {
    left: 5px;
    width: 24px;
    height: 24px;
  }
`;

const SearchRightActions = styled.div`
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;

  @media (max-width: 640px) {
    right: 5px;
    gap: 4px;
  }
`;

const BarcodeScanChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.16s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    background: ${props => props.$themeColor ? `${props.$themeColor}15` : '#fff7ed'};
    border-color: ${props => props.$themeColor || '#f97316'};
    color: ${props => props.$themeColor || '#ea580c'};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 640px) {
    padding: 0 7px;
    span {
      display: none;
    }
  }
`;

const ClearSearchBtn = styled.button`
  background: #e2e8f0;
  border: none;
  border-radius: 50%;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  transition: all 0.15s;

  &:hover {
    background: #cbd5e1;
    color: #0f172a;
  }
`;

const SearchShortcutBadge = styled.span`
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  pointer-events: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  line-height: 1;
`;

const CameraScanBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 7px;
  height: 42px;
  padding: 0 15px;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: white;
  color: #0f172a;
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(15, 23, 42, 0.06);
  }

  &:active {
    transform: translateY(0);
  }
`;

const AddProductBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 7px;
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: white;
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
  box-shadow: 0 2px 7px rgba(15, 23, 42, 0.18);

  &:hover {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.25);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 640px) {
    height: 38px;
    padding: 0 10px;
    font-size: 11.5px;
    border-radius: 9px;
    gap: 4px;
  }
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  flex-wrap: nowrap;
  overflow: hidden;

  @media (max-width: 900px) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 8px 10px;
  }
`;

const SegmentedTabs = styled.div`
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 3px;
  gap: 3px;
  flex-shrink: 0;

  @media (max-width: 640px) {
    width: 100%;
    display: flex;
    justify-content: space-around;
  }
`;

const SegmentTab = styled.button`
  border: 1px solid ${props => {
    if (!props.$active) return 'transparent';
    if (props.$type === 'VEG') return '#86efac';
    if (props.$type === 'TRENDING') return '#fdba74';
    return '#e2e8f0';
  }};
  border-radius: 9px;
  padding: 6px 13px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: ${props => {
    if (!props.$active) return 'transparent';
    if (props.$type === 'VEG') return '#ecfdf5';
    if (props.$type === 'TRENDING') return '#fff7ed';
    return '#ffffff';
  }};
  color: ${props => {
    if (!props.$active) return '#64748b';
    if (props.$type === 'VEG') return '#15803d';
    if (props.$type === 'TRENDING') return '#c2410c';
    return '#0f172a';
  }};
  box-shadow: ${props => props.$active ? '0 2px 5px rgba(15, 23, 42, 0.08)' : 'none'};
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;

  &:hover {
    color: #0f172a;
    background: ${props => props.$active ? '' : 'rgba(255, 255, 255, 0.65)'};
  }

  &:active {
    transform: scale(0.98);
  }

  @media (max-width: 640px) {
    flex: 1;
    justify-content: center;
    padding: 5px 8px;
    font-size: 11px;
    gap: 4px;
  }
`;

const FilterDivider = styled.div`
  width: 1px;
  height: 24px;
  background: #e2e8f0;
  flex-shrink: 0;

  @media (max-width: 900px) {
    display: none;
  }
`;

const pulseBar = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
`;

const CatalogLoadingProgress = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #f1f5f9;
  overflow: hidden;
  z-index: 20;

  &::after {
    content: '';
    display: block;
    width: 40%;
    height: 100%;
    background: linear-gradient(90deg, transparent, #f97316, transparent);
    animation: ${pulseBar} 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
`;

const ScrollableBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 24px 16px;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
  gap: 14px;
  width: 100%;
  padding: 10px 4px 6px 10px;
  opacity: ${props => props.$loading ? 0.65 : 1};
  transition: opacity 0.2s ease;
  pointer-events: ${props => props.$loading ? 'none' : 'auto'};

  @media (max-width: 640px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    padding: 6px 2px 75px 2px;
  }
`;

const EmptyNotice = styled.div`
  padding: 60px 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const CatalogFooter = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  box-shadow: 0 -2px 6px rgba(15, 23, 42, 0.03);
  flex-shrink: 0;
  z-index: 5;

  @media (max-width: 640px) {
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
    gap: 10px;
  }
`;

const PageBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 18px;
  border-radius: 9px;
  border: 1.5px solid #e2e8f0;
  background: #ffffff;
  font-weight: 700;
  font-size: 13px;
  color: #1e293b;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);

  &:hover:not(:disabled) {
    border-color: #f97316;
    color: #ea580c;
    background: #fff7ed;
    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.18);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.38;
    cursor: not-allowed;
    background: #f8fafc;
    border-color: #e2e8f0;
    box-shadow: none;
    color: #94a3b8;
  }

  @media (max-width: 640px) {
    padding: 6px 14px;
    font-size: 12px;
  }
`;

const PageInfoText = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  user-select: none;

  .item-count {
    font-weight: 500;
    color: #64748b;
  }
`;


export default function PosProductCatalog({
  bootstrap,
  catalog,
  cart,
  ui,
  order,
  onOpenCameraScanner
}) {
  const searchInputRef = useRef(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const { config, startNewProductForPopup, categories } = bootstrap;
  const barcodeEnabled = config?.barcodeScannerEnabled === true;
  const {
    search, setSearch, dietFilter, setDietFilter,
    activeCat, setActiveCat, paginatedProducts,
    visibleProducts, productPage, setProductPage, PRODUCT_PAGE_SIZE,
    productListingOn, standardMatches, addFromStandardSearch,
    hasMore, loadingProducts, loadingMore, onNextPage, onPrevPage
  } = catalog;
  const { productCartQuantity, decrementProduct, incrementProduct, addToCart, setProductQty } = cart;
  const { THEME: theme, sym } = ui;
  const currencyDecimalPlaces = config?.currencyDecimalPlaces ?? 2;

  return (
    <CatalogContainer $productListingOn={productListingOn}>
      {/* Search and Action Toolbar */}
      <HeaderToolbar>
        <SearchWrapper>
          <SearchIconBox $focused={isSearchFocused} $themeColor={theme?.main}>
            <FaSearch size={13} />
          </SearchIconBox>
          <SearchInput
            ref={searchInputRef}
            $themeColor={theme?.main}
            placeholder={barcodeEnabled ? "Search products by name or scan barcode..." : "Search products by name or code..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          <SearchRightActions>
            {barcodeEnabled && onOpenCameraScanner && (
              <BarcodeScanChip
                type="button"
                $themeColor={theme?.main}
                onClick={onOpenCameraScanner}
                title="Scan Barcode via Camera"
              >
                <FaBarcode size={12} />
                <span>Scan</span>
              </BarcodeScanChip>
            )}
            {search ? (
              <ClearSearchBtn onClick={() => setSearch('')} title="Clear search">
                <FaTimes size={10} />
              </ClearSearchBtn>
            ) : (
              <SearchShortcutBadge title="Press '/' to search">/</SearchShortcutBadge>
            )}
          </SearchRightActions>

          {/* Floating dropdown suggestions in Counter Mode */}
          {!productListingOn && search && search.trim() !== '' && (
            <S.CsFloatingSuggestBox>
              {standardMatches && standardMatches.length > 0 ? (
                <S.CsSuggestList>
                  {standardMatches.map(p => {
                    const quantity = productCartQuantity(p);
                    const hasOptions = hasExtendedOptions(p);
                    return (
                      <S.CsSuggestItem
                        key={p.id}
                        onClick={() => addFromStandardSearch(p, addToCart, searchInputRef)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            addFromStandardSearch(p, addToCart, searchInputRef);
                          }
                        }}
                      >
                        <S.CsSuggestItemMeta>
                          <strong>{p.name}</strong>
                          <span>{p.categoryName || 'Menu item'} • {hasOptions ? 'Options' : `${sym}${Number(p.price || 0).toFixed(currencyDecimalPlaces)}`}</span>
                        </S.CsSuggestItemMeta>
                        {hasOptions ? (
                          <S.CsSuggestAddBtn 
                            $themeColor={theme?.main || '#f97316'} 
                            $outline
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(p);
                            }}
                          >
                            {quantity > 0 && <S.CsVariantCount $themeColor={theme?.main || '#f97316'} style={{ height: 16, width: 16, fontSize: 10 }}>{quantity}</S.CsVariantCount>}
                            Options <FaChevronRight style={{ fontSize: 10 }} />
                          </S.CsSuggestAddBtn>
                        ) : quantity > 0 ? (
                          <S.CsSuggestStepper onClick={(e) => e.stopPropagation()}>
                            <S.CsSuggestQtyBtn onClick={(event) => decrementProduct(event, p)}><FaMinus /></S.CsSuggestQtyBtn>
                            <S.CsSuggestQtyVal>{quantity}</S.CsSuggestQtyVal>
                            <S.CsSuggestQtyBtn onClick={(event) => incrementProduct(event, p)}><FaPlus /></S.CsSuggestQtyBtn>
                          </S.CsSuggestStepper>
                        ) : (
                          <S.CsSuggestAddIcon 
                            $themeColor={theme?.main || '#f97316'}
                            onClick={(e) => {
                              e.stopPropagation();
                              addFromStandardSearch(p, addToCart, searchInputRef);
                            }}
                          >
                            <FaPlus />
                          </S.CsSuggestAddIcon>
                        )}
                      </S.CsSuggestItem>
                    );
                  })}
                </S.CsSuggestList>
              ) : (
                <S.CsNoSuggests>No matching menu items found</S.CsNoSuggests>
              )}
            </S.CsFloatingSuggestBox>
          )}
        </SearchWrapper>

        <AddProductBtn type="button" onClick={() => startNewProductForPopup()}>
          <FaPlus size={10} /> Add Product
        </AddProductBtn>
      </HeaderToolbar>

      {/* Product Listing (Filters, Categories, Product Cards) ONLY shown when productListingOn is true */}
      {productListingOn && (
        <>
          {/* Filter Tabs (All, Veg, Trending) & Categories */}
          <FilterRow>
            <SegmentedTabs>
              <SegmentTab
                type="button"
                $active={dietFilter === 'ALL'}
                $type="ALL"
                onClick={() => setDietFilter('ALL')}
              >
                All
              </SegmentTab>
              <SegmentTab
                type="button"
                $active={dietFilter === 'VEG'}
                $type="VEG"
                onClick={() => setDietFilter('VEG')}
              >
                <FaLeaf size={11} style={{ color: '#16a34a' }} /> Veg Only
              </SegmentTab>
              <SegmentTab
                type="button"
                $active={dietFilter === 'TRENDING'}
                $type="TRENDING"
                onClick={() => setDietFilter('TRENDING')}
              >
                <FaFire size={11} style={{ color: '#ea580c' }} /> Trending
              </SegmentTab>
            </SegmentedTabs>

            <FilterDivider />

            {/* Category Horizontal Carousel */}
            <PosCategoryFilter
              categories={categories}
              activeCat={activeCat}
              setActiveCat={setActiveCat}
              theme={theme}
            />
          </FilterRow>

          {/* Product Grid Area */}
          <ScrollableBody>
            {(loadingProducts || loadingMore) && <CatalogLoadingProgress />}
            {paginatedProducts.length === 0 ? (
              <EmptyNotice>
                <FaLayerGroup size={32} />
                <span>No products match your search or filter.</span>
              </EmptyNotice>
            ) : (
              <ProductGrid $loading={loadingProducts || loadingMore}>
                {paginatedProducts.map((product) => {
                  const quantity = productCartQuantity(product);
                  const hasOptions = hasExtendedOptions(product);
                  return (
                    <PosProductCard
                      key={product.id}
                      product={product}
                      quantity={quantity}
                      hasOptions={hasOptions}
                      sym={sym}
                      currencyDecimalPlaces={currencyDecimalPlaces}
                      theme={theme}
                      onAdd={addToCart}
                      onIncrement={incrementProduct}
                      onDecrement={decrementProduct}
                      onSetQty={setProductQty}
                      menuImagesEnabled={config?.menuImagesEnabled !== false}
                    />
                  );
                })}
              </ProductGrid>
            )}

          </ScrollableBody>

          {/* Sticky Pagination & Catalog Footer */}
          <CatalogFooter>
            <PageBtn
              type="button"
              disabled={productPage === 0 || loadingMore || loadingProducts}
              onClick={() => onPrevPage ? onPrevPage() : setProductPage((p) => p - 1)}
              title="Go to previous page"
            >
              ← Prev
            </PageBtn>

            <PageInfoText>
              Page {productPage + 1}
              <span className="item-count">
                ({visibleProducts.length} product{visibleProducts.length === 1 ? '' : 's'}{hasMore ? '+' : ''})
              </span>
            </PageInfoText>

            <PageBtn
              type="button"
              disabled={!hasMore || loadingMore || loadingProducts}
              onClick={() => onNextPage ? onNextPage() : setProductPage((p) => p + 1)}
              title={hasMore ? "Load next products" : "No more products"}
            >
              {loadingMore ? 'Loading...' : 'Next →'}
            </PageBtn>
          </CatalogFooter>
        </>
      )}

    </CatalogContainer>
  );
}
