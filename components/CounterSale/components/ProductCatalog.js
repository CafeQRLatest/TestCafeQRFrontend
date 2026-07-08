import React from 'react';
import { FaPlus, FaMinus, FaSearch, FaChevronRight } from 'react-icons/fa';
import * as S from '../CounterSale.styles';
import ProductCard from './ProductCard';
import CategoryFilter from './CategoryFilter';
import { hasExtendedOptions } from '../domain/cart';

export default function ProductCatalog({
  bootstrap,
  catalog,
  cart,
  ui,
  order
}) {
  const searchInputRef = React.useRef(null);
  const { config, startNewProductForPopup, categories } = bootstrap;
  const { 
    search, setSearch, productListingOn, standardMatches, addFromStandardSearch,
    dietFilter, setDietFilter, activeCat, setActiveCat, paginatedProducts,
    visibleProducts, productPage, setProductPage, PRODUCT_PAGE_SIZE
  } = catalog;
  const { productCartQuantity, decrementProduct, incrementProduct, addToCart, setProductQty } = cart;
  const { THEME: theme, sym } = ui;
  const currencyDecimalPlaces = config?.currencyDecimalPlaces ?? 2;

  return (
    <>
      <S.CsCatalogToolbar>
        <S.CsSearchBar>
          <S.CsSearchIcon><FaSearch/></S.CsSearchIcon>
          <S.CsSearchInput 
            ref={searchInputRef}
            placeholder="Search menu items..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            $themeColor={theme.main}
          />
          {!productListingOn && search.trim() !== '' && (
            <S.CsFloatingSuggestBox>
              {standardMatches.length > 0 ? (
                <S.CsSuggestList>
                  {standardMatches.map(p => {
                    const quantity = productCartQuantity(p);
                    const hasOptions = hasExtendedOptions(p);
                    return (
                      <S.CsSuggestItem
                        key={p.id}
                        onClick={() => addFromStandardSearch(p, searchInputRef)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            addFromStandardSearch(p, searchInputRef);
                          }
                        }}
                      >
                        <S.CsSuggestItemMeta>
                          <strong>{p.name}</strong>
                          <span>{p.categoryName || 'Menu item'} • {hasOptions ? 'Options' : `${sym}${Number(p.price || 0).toFixed(currencyDecimalPlaces)}`}</span>
                        </S.CsSuggestItemMeta>
                        {hasOptions ? (
                          <S.CsSuggestAddBtn $themeColor={theme.main} $outline>
                            {quantity > 0 && <S.CsVariantCount $themeColor={theme.main} style={{ height: 16, width: 16, fontSize: 10 }}>{quantity}</S.CsVariantCount>}
                            Options <FaChevronRight style={{ fontSize: 10 }} />
                          </S.CsSuggestAddBtn>
                        ) : quantity > 0 ? (
                          <S.CsSuggestStepper onClick={(e) => e.stopPropagation()}>
                            <S.CsSuggestQtyBtn onClick={(event) => decrementProduct(event, p)}><FaMinus /></S.CsSuggestQtyBtn>
                            <S.CsSuggestQtyVal>{quantity}</S.CsSuggestQtyVal>
                            <S.CsSuggestQtyBtn onClick={(event) => incrementProduct(event, p)}><FaPlus /></S.CsSuggestQtyBtn>
                          </S.CsSuggestStepper>
                        ) : (
                          <S.CsSuggestAddIcon $themeColor={theme.main}><FaPlus /></S.CsSuggestAddIcon>
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
        </S.CsSearchBar>

        <S.CsAddProductButton
          type="button" 
          onClick={startNewProductForPopup}
          $themeColor={theme.main}
        >
          <FaPlus size={10} /> Add Product
        </S.CsAddProductButton>
      </S.CsCatalogToolbar>

      {productListingOn && (
        <>
          <S.CsFilterTabs>
            <S.CsFilterBtn $active={dietFilter === 'ALL'} $themeColor={theme.main} onClick={() => setDietFilter('ALL')}>
              All
            </S.CsFilterBtn>
            <S.CsFilterBtn $active={dietFilter === 'VEG'} $themeColor={theme.main} onClick={() => setDietFilter('VEG')}>
              Veg Only
            </S.CsFilterBtn>
            <S.CsFilterBtn $active={dietFilter === 'TRENDING'} $themeColor={theme.main} onClick={() => setDietFilter('TRENDING')}>
              Trending
            </S.CsFilterBtn>
          </S.CsFilterTabs>
          
          <CategoryFilter
            categories={categories}
            activeCat={activeCat}
            setActiveCat={setActiveCat}
            theme={theme}
          />

          <S.CsProductGrid>
            {paginatedProducts.map(p => {
              const quantity = productCartQuantity(p);
              const hasOptions = hasExtendedOptions(p);
              return (
                <ProductCard
                  key={p.id}
                  product={p}
                  quantity={quantity}
                  hasOptions={hasOptions}
                  sym={sym}
                  currencyDecimalPlaces={currencyDecimalPlaces}
                  theme={theme}
                  onAdd={addToCart}
                  onIncrement={incrementProduct}
                  onDecrement={decrementProduct}
                  onSetQty={setProductQty}
                  activeOrderMode={order?.activeOrderMode || 'settle'}
                />
              );
            })}
          </S.CsProductGrid>

          {visibleProducts.length > PRODUCT_PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '16px 0', borderTop: '1px solid #f1f5f9', marginTop: '12px' }}>
              <button
                disabled={productPage === 0}
                onClick={() => setProductPage(p => p - 1)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  color: theme.main,
                  cursor: productPage === 0 ? 'not-allowed' : 'pointer',
                  opacity: productPage === 0 ? 0.4 : 1,
                  transition: 'all 0.2s'
                }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>
                Page {productPage + 1} of {Math.ceil(visibleProducts.length / PRODUCT_PAGE_SIZE)} &nbsp;·&nbsp; {visibleProducts.length} items
              </span>
              <button
                disabled={productPage >= Math.ceil(visibleProducts.length / PRODUCT_PAGE_SIZE) - 1}
                onClick={() => setProductPage(p => p + 1)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  color: theme.main,
                  cursor: productPage >= Math.ceil(visibleProducts.length / PRODUCT_PAGE_SIZE) - 1 ? 'not-allowed' : 'pointer',
                  opacity: productPage >= Math.ceil(visibleProducts.length / PRODUCT_PAGE_SIZE) - 1 ? 0.4 : 1,
                  transition: 'all 0.2s'
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
