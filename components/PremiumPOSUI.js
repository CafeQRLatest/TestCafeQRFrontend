import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const PageContainer = styled.div`
  width: 100%;
  max-width: 100%;
  padding: 8px 0 60px;
  min-height: 100dvh;
  font-family: 'Outfit', 'DM Sans', 'Inter', sans-serif;
  background-color: #f8fafc;
  animation: ${fadeIn} 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow-x: clip;
  display: flex;
  flex-direction: column;
`;

export const POSHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  margin-bottom: 24px;
  border-radius: 0 0 24px 24px;
  gap: 16px;
  min-width: 0;

  @media (max-width: 720px) {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px 16px;
    border-radius: 0 0 18px 18px;
  }
`;

export const HeaderTitle = styled.h1`
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  overflow-wrap: anywhere;

  @media (max-width: 520px) {
    font-size: 20px;
  }
`;

export const MainLayout = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-start;
  width: 100%;
  padding: 0 24px;
  min-width: 0;

  @media (max-width: 1200px) {
    flex-direction: column;
  }

  @media (max-width: 720px) {
    padding: 0 14px;
    gap: 16px;
  }
`;

export const MenuSection = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  width: 100%;
`;

export const CartSidebar = styled.div`
  width: 400px;
  background: white;
  border-radius: 24px;
  box-shadow: 0 10px 40px -10px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 120px);
  position: sticky;
  top: 24px;
  overflow: hidden;

  @media (max-width: 1200px) {
    width: 100%;
    height: auto;
    position: static;
  }
`;

export const TopBar = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  background: white;
  padding: 16px 24px;
  border-radius: 24px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
  min-width: 0;

  @media (max-width: 640px) {
    align-items: stretch;
    flex-direction: column;
    padding: 14px;
    border-radius: 18px;
  }
`;

export const SearchInput = styled.input`
  flex: 1;
  padding: 14px 20px 14px 48px;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 500;
  background: #f8fafc url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%23ea580c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>') no-repeat 16px center;
  transition: all 0.3s;
  
  &:focus {
    outline: none;
    border-color: #ea580c;
    background-color: white;
    box-shadow: 0 10px 15px -3px rgba(234, 88, 12, 0.1);
  }
`;

export const CategoryCarousel = styled.div`
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 8px 4px;
  &::-webkit-scrollbar { display: none; }
`;

export const CategoryPill = styled.button`
  padding: 10px 20px;
  border-radius: 99px;
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  border: 1px solid ${props => props.$active ? '#ea580c' : '#e2e8f0'};
  background: ${props => props.$active ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : 'white'};
  color: ${props => props.$active ? 'white' : '#64748b'};
  box-shadow: ${props => props.$active ? '0 4px 12px rgba(234, 88, 12, 0.2)' : 'none'};
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(234, 88, 12, 0.15);
  }
`;

export const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
  gap: 16px;
  align-content: start;
  width: 100%;
  min-width: 0;

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }
`;

export const ProductCard = styled.div`
  background: white;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid #f1f5f9;
  transition: all 0.3s;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  min-width: 0;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px -8px rgba(0,0,0,0.12);
    border-color: #fed7aa;
  }
`;

export const ProductImage = styled.div`
  height: 120px;
  background-size: cover;
  background-position: center;
  background-color: #f8fafc;
`;

export const ProductInfo = styled.div`
  padding: 16px;
`;

export const ProductName = styled.div`
  font-weight: 700;
  font-size: 14px;
  color: #1e293b;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
`;

export const ProductPriceRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;

  @media (max-width: 420px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

export const ProductPrice = styled.div`
  font-weight: 800;
  color: #ea580c;
  font-size: 16px;
`;

export const AddButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid #fed7aa;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #ea580c;
    color: white;
  }
`;

/* Cart Styles */
export const CartHeader = styled.div`
  padding: 20px 24px;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;

  @media (max-width: 420px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

export const CartTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const CartBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const CartItemCard = styled.div`
  background: white;
  padding: 12px 16px;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const CartItemInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

export const CartItemName = styled.span`
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
`;

export const CartItemPrice = styled.span`
  font-weight: 600;
  font-size: 13px;
  color: #64748b;
`;

export const QtyControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f1f5f9;
  padding: 4px 6px;
  border-radius: 12px;
  flex: 0 0 auto;
`;

export const QtyBtn = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
`;

export const CartFooter = styled.div`
  padding: 20px 24px;
  background: white;
  border-top: 1px solid #f1f5f9;
`;

export const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: ${props => props.$total ? '20px' : '14px'};
  font-weight: ${props => props.$total ? '800' : '600'};
  color: ${props => props.$total ? '#0f172a' : '#64748b'};
`;

export const MainActionButton = styled.button`
  width: 100%;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, ${props => props.$color || '#ea580c'} 0%, ${props => props.$colorDark || '#c2410c'} 100%);
  color: white;
  font-size: 16px;
  font-weight: 800;
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.15);
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 20px rgba(0,0,0,0.2);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

export const ActionButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

export const ActionBtn = styled.button`
  flex: 1;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid ${props => props.$active ? props.color : '#e2e8f0'};
  background: ${props => props.$active ? props.bg : 'white'};
  color: ${props => props.$active ? props.color : '#64748b'};
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;

  &:hover {
    border-color: ${props => props.color};
    color: ${props => props.color};
  }
`;

/* Table Mode Styles */
export const TableGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
  gap: 20px;
  align-content: start;

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }
`;

export const TableCard = styled.div`
  background: white;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  border: 2px solid ${props => {
    switch(props.$status) {
      case 'OCCUPIED': return '#ef4444';
      case 'BILLED': return '#0ea5e9';
      default: return '#10b981';
    }
  }};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0,0,0,0.1);
  }
`;

export const TableNumber = styled.div`
  font-size: 32px;
  font-weight: 800;
  color: #0f172a;
`;

export const TableStatusPill = styled.div`
  padding: 6px 12px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 700;
  color: white;
  background: ${props => {
    switch(props.$status) {
      case 'OCCUPIED': return '#ef4444';
      case 'BILLED': return '#0ea5e9';
      default: return '#10b981';
    }
  }};
`;

export const ModeSwitchGroup = styled.div`
  display: flex;
  background: #f1f5f9;
  padding: 6px;
  border-radius: 16px;
  gap: 4px;
  max-width: 100%;
  overflow-x: auto;
`;

export const ModeSwitchBtn = styled.button`
  padding: 8px 16px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 13px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  background: ${props => props.$active ? 'white' : 'transparent'};
  color: ${props => props.$active ? '#ea580c' : '#64748b'};
  box-shadow: ${props => props.$active ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'};

  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
`;
