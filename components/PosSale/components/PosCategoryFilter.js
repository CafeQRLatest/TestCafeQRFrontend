import React, { useRef, useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import { FaChevronLeft, FaChevronRight, FaLayerGroup, FaCoffee, FaUtensils, FaHamburger, FaTag, FaIceCream } from 'react-icons/fa';

function getCategoryIcon(cat) {
  if (!cat || cat === 'ALL') return <FaLayerGroup size={11} />;
  const lower = cat.toLowerCase();
  if (lower.includes('drink') || lower.includes('tea') || lower.includes('coffee') || lower.includes('juice') || lower.includes('shake') || lower.includes('beverage') || lower.includes('soda') || lower.includes('water')) {
    return <FaCoffee size={11} />;
  }
  if (lower.includes('burger') || lower.includes('sandwich') || lower.includes('snack') || lower.includes('fry') || lower.includes('fries') || lower.includes('pizza') || lower.includes('wrap')) {
    return <FaHamburger size={11} />;
  }
  if (lower.includes('dessert') || lower.includes('ice') || lower.includes('sweet') || lower.includes('cake') || lower.includes('pastry')) {
    return <FaIceCream size={11} />;
  }
  if (lower.includes('food') || lower.includes('meal') || lower.includes('rice') || lower.includes('mandhi') || lower.includes('biryani') || lower.includes('curry') || lower.includes('chicken') || lower.includes('mutton') || lower.includes('beef') || lower.includes('fish')) {
    return <FaUtensils size={11} />;
  }
  return <FaTag size={10} style={{ opacity: 0.8 }} />;
}

const FilterContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  flex: 1 1 300px;
  min-width: 300px;
  margin: 0;
  width: auto;

  @media (max-width: 640px) {
    min-width: 0;
  }
`;

const ScrollTrack = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  padding: 4px 2px;
  flex: 1;
  min-width: 0;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const CategoryPill = styled.button`
  border: 1.5px solid ${props => props.$active ? 'transparent' : '#e2e8f0'};
  background: ${props => props.$active 
    ? `linear-gradient(135deg, ${props.$themeColor || '#f97316'} 0%, ${props.$themeDark || '#ea580c'} 100%)` 
    : '#ffffff'};
  color: ${props => props.$active ? '#ffffff' : '#334155'};
  font-weight: 700;
  font-size: 13px;
  padding: 6.5px 16px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  box-shadow: ${props => props.$active 
    ? `0 3px 12px ${props.$themeColor ? `${props.$themeColor}45` : 'rgba(249, 115, 22, 0.4)'}` 
    : '0 1px 3px rgba(0, 0, 0, 0.02)'};
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  flex-shrink: 0;

  &:hover {
    background: ${props => props.$active 
      ? `linear-gradient(135deg, ${props.$themeColor || '#f97316'} 0%, ${props.$themeDark || '#ea580c'} 100%)` 
      : '#f8fafc'};
    border-color: ${props => props.$active ? 'transparent' : (props.$themeColor || '#f97316')};
    color: ${props => props.$active ? '#ffffff' : '#0f172a'};
    transform: translateY(-1px);
    box-shadow: ${props => props.$active 
      ? `0 4px 14px ${props.$themeColor ? `${props.$themeColor}55` : 'rgba(249, 115, 22, 0.45)'}` 
      : '0 3px 8px rgba(0, 0, 0, 0.06)'};
  }

  &:active {
    transform: translateY(0);
  }
`;

const ScrollBtn = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 9px;
  border: 1.5px solid #e2e8f0;
  background: white;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: #f8fafc;
    color: #0f172a;
    border-color: ${props => props.$themeColor || '#f97316'};
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.25;
    cursor: not-allowed;
    box-shadow: none;
  }
`;

export default function PosCategoryFilter({
  categories = [],
  activeCat,
  setActiveCat,
  theme
}) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const checkScrollLimits = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setHasOverflow(scrollWidth > clientWidth);
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollWidth - scrollLeft - clientWidth > 2);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      checkScrollLimits();
      const timeout = setTimeout(checkScrollLimits, 200);
      el.addEventListener('scroll', checkScrollLimits);
      window.addEventListener('resize', checkScrollLimits);

      const handleWheel = (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      };
      el.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
        clearTimeout(timeout);
        el.removeEventListener('scroll', checkScrollLimits);
        window.removeEventListener('resize', checkScrollLimits);
        el.removeEventListener('wheel', handleWheel);
      };
    }
  }, [categories, activeCat, checkScrollLimits]);

  const scrollCarousel = (offset) => {
    const el = scrollRef.current;
    if (el) {
      el.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <FilterContainer>
      {hasOverflow && (
        <ScrollBtn
          type="button"
          $themeColor={theme?.main || '#f97316'}
          disabled={!canScrollLeft}
          onClick={() => scrollCarousel(-180)}
          title="Scroll Left"
        >
          <FaChevronLeft size={9} />
        </ScrollBtn>
      )}

      <ScrollTrack ref={scrollRef}>
        {categories.map((cat) => {
          const isAll = cat === 'ALL';
          const isActive = activeCat === cat;
          return (
            <CategoryPill
              key={cat}
              type="button"
              $active={isActive}
              $themeColor={theme?.main || '#f97316'}
              $themeDark={theme?.dark || '#ea580c'}
              onClick={() => setActiveCat(cat)}
            >
              {getCategoryIcon(cat)}
              <span>{isAll ? 'Everything' : cat}</span>
            </CategoryPill>
          );
        })}
      </ScrollTrack>

      {hasOverflow && (
        <ScrollBtn
          type="button"
          $themeColor={theme?.main || '#f97316'}
          disabled={!canScrollRight}
          onClick={() => scrollCarousel(180)}
          title="Scroll Right"
        >
          <FaChevronRight size={9} />
        </ScrollBtn>
      )}
    </FilterContainer>
  );
}
