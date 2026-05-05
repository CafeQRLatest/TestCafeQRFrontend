import React, { useState, useEffect, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import api from '../utils/api';
import { 
  FaPlus, FaMinus, FaSearch, FaUtensils, 
  FaWallet, FaFire, FaArrowLeft
} from 'react-icons/fa';
import { calculateOrderTotals } from '../utils/orderCalculations';

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
`;

const ModalContent = styled.div`
  background: #f8fafc;
  width: 100%;
  max-width: 1400px;
  height: 95vh;
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${fadeIn} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
`;

const CounterHeader = styled.header`
  padding: 20px 32px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
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
`;

const Title = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
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
`;

const CatalogSection = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  gap: 24px;
`;

const CartSection = styled.aside`
  width: 450px;
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0,0,0,0.02);
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

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  overflow-y: auto;
  padding-bottom: 20px;
`;

const ProductCard = styled.div`
  background: white;
  border-radius: 24px;
  border: 2px solid ${props => props.$inCart ? props.$themeColor : '#f1f5f9'};
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover { transform: translateY(-6px); box-shadow: 0 12px 24px -8px rgba(0,0,0,0.1); border-color: ${props => props.$themeColor}40; }
`;

const ProdImg = styled.div`
  height: 140px;
  border-radius: 16px;
  background-size: cover;
  background-position: center;
  background-color: #f8fafc;
`;

const ProdName = styled.div`
  font-weight: 700;
  font-size: 15px;
  color: #1e293b;
  line-height: 1.4;
  height: 42px;
  overflow: hidden;
`;

const ProdPriceRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ProdPrice = styled.div`
  font-weight: 800;
  font-size: 18px;
  color: ${props => props.$themeColor};
`;

const AddBtn = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: ${props => props.$themeColor}15;
  color: ${props => props.$themeColor};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s;
  &:hover { background: ${props => props.$themeColor}; color: white; }
`;

const CartHeader = styled.div`
  padding: 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CartBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const CartFooter = styled.div`
  padding: 24px;
  border-top: 1px solid #e2e8f0;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 16px;
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

export default function CounterSale({ onBack, initialTable, onOrderCreated }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['ALL']);
  const [activeCat, setActiveCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [orderMode, setOrderMode] = useState('settle'); // 'kitchen' | 'settle'
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState(null);

  const THEME = orderMode === 'kitchen' 
    ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' } 
    : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3' };

  useEffect(() => {
    (async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          api.get('/api/v1/products'),
          api.get('/api/v1/configurations')
        ]);
        const pList = pRes.data.data || [];
        setProducts(pList);
        setConfig(cRes.data.data);
        const cats = ['ALL', ...new Set(pList.map(p => p.categoryName).filter(Boolean))];
        setCategories(cats);
      } catch (e) {
        console.error('Failed to load counter data', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addToCart = (p) => {
    setCart(prev => {
      const exists = prev.find(item => item.id === p.id);
      if (exists) return prev.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { ...p, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) return { ...item, qty: Math.max(1, item.qty + delta) };
      return item;
    }).filter(item => item.qty > 0));
  };

  const totals = useMemo(() => {
    if (!config) return { subtotal: 0, tax: 0, total: 0 };
    return calculateOrderTotals(
      cart.map(i => ({
        ...i,
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
  }, [cart, config]);

  const handlePlaceOrder = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const processedLines = (totals.processed_items || []).map(pi => {
        const piId = pi.id || pi.productId || pi.product_id || pi.pid;
        const cartItem = cart.find(item => {
          const itemId = item.id || item.productId || item.product_id || item.pid;
          return String(itemId || '') === String(piId || '')
            || item.name === pi.name
            || item.name === pi.item_name
            || item.productName === pi.productName;
        });
        const unitPrice = Number(pi.unit_price ?? pi.price ?? cartItem?.price ?? 0);
        const productName = pi.productName || pi.name || pi.item_name || cartItem?.name || 'Item';

        return {
          productId: cartItem?.id || pi.productId || pi.product_id || pi.id || pi.pid || null,
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
        orderSource: 'OFFLINE',
        fulfillmentType: initialTable ? 'DINE_IN' : 'TAKEAWAY', // Align with enum: DINE_IN, TAKEAWAY, DELIVERY
        tableNumber: initialTable ? initialTable.tableNumber : null,
        tableId: initialTable ? initialTable.id : null,
        orderStatus: orderMode === 'kitchen' ? 'KITCHEN' : 'COMPLETED',
        paymentStatus: orderMode === 'kitchen' ? 'PENDING' : 'PAID',
        reference: 'CASH', // Using reference as the payment method column
        grandTotal: Number(totals.total_amount.toFixed(2)),
        totalTaxAmount: Number(totals.total_tax.toFixed(2)),
        totalAmount: Number(totals.total_inc_tax.toFixed(2)),
        lines: processedLines
      };

      const res = await api.post('/api/v1/orders', payload);
      if (res.data.success) {
        const savedOrder = res.data.data;
        const savedLines = Array.isArray(savedOrder?.lines) && savedOrder.lines.length
          ? savedOrder.lines
          : processedLines;
        const printOrder = {
          ...savedOrder,
          ...payload,
          id: savedOrder?.id,
          orderNo: savedOrder?.orderNo || payload.orderNo,
          invoiceNo: savedOrder?.invoiceNo,
          paymentNo: savedOrder?.paymentNo,
          createdAt: savedOrder?.createdAt,
          updatedAt: savedOrder?.updatedAt,
          lines: savedLines,
          items: processedLines,
          pricesIncludeTax: config?.pricesIncludeTax,
        };

        onOrderCreated?.(printOrder, orderMode === 'kitchen' ? 'kot' : 'bill');
        setCart([]);
        if (onBack) onBack();
      }
    } catch (e) {
      alert('Failed to place order: ' + (e.response?.data?.message || e.message));
    } finally {
      setProcessing(false);
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
              <Subtitle>New Order • {new Date().toLocaleTimeString()}</Subtitle>
            </TitleGroup>
          </HeaderLeft>

          <div style={{ display: 'flex', gap: '12px', background: '#f1f5f9', padding: '6px', borderRadius: '16px' }}>
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
          </div>
        </CounterHeader>

        <MainLayout>
          <CatalogSection>
            <SearchBar>
              <SearchIcon><FaSearch/></SearchIcon>
              <SearchInput 
                placeholder="Search menu items..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                $themeColor={THEME.main}
              />
            </SearchBar>

            <CategoryScroll>
              {categories.map(c => (
                <CatBtn 
                  key={c} 
                  $active={activeCat === c} 
                  $themeColor={THEME.main}
                  onClick={() => setActiveCat(c)}
                >
                  {c}
                </CatBtn>
              ))}
            </CategoryScroll>

            <ProductGrid>
              {products
                .filter(p => (activeCat === 'ALL' || p.categoryName === activeCat) && 
                           p.name.toLowerCase().includes(search.toLowerCase()))
                .map(p => {
                  const inCart = cart.find(item => item.id === p.id);
                  return (
                    <ProductCard key={p.id} $themeColor={THEME.main} $inCart={!!inCart} onClick={() => addToCart(p)}>
                      {p.imageUrl && <ProdImg style={{ backgroundImage: `url(${p.imageUrl})` }}/>}
                      <ProdName>{p.name}</ProdName>
                      <ProdPriceRow>
                        <ProdPrice $themeColor={THEME.main}>₹{p.price.toFixed(2)}</ProdPrice>
                        <AddBtn $themeColor={THEME.main}><FaPlus/></AddBtn>
                      </ProdPriceRow>
                    </ProductCard>
                  );
                })}
            </ProductGrid>
          </CatalogSection>

          <CartSection>
            <CartHeader>
              <Title style={{ fontSize: '18px' }}>Your Cart</Title>
              <Subtitle style={{ color: THEME.main, fontWeight: 800 }}>{cart.length} Items</Subtitle>
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
                  <CartItemCard key={item.id}>
                    <CartItemInfo>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>{item.name}</div>
                      <div style={{ color: THEME.main, fontWeight: 800 }}>₹{(item.price * item.qty).toFixed(2)}</div>
                    </CartItemInfo>
                    <QtyGroup>
                      <QtyBtn onClick={() => updateQty(item.id, -1)}><FaMinus/></QtyBtn>
                      <div style={{ fontWeight: 800, minWidth: '20px', textAlign: 'center' }}>{item.qty}</div>
                      <QtyBtn onClick={() => updateQty(item.id, 1)}><FaPlus/></QtyBtn>
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
        </MainLayout>
      </ModalContent>
    </ModalOverlay>
  );
}
