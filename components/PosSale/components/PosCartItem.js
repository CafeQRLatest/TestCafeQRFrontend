import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { FaMinus, FaPlus, FaEdit, FaStickyNote, FaTimes, FaTrashAlt } from 'react-icons/fa';

// ── Styled Components ──

const ItemWrapper = styled.div`
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  padding: ${props => props.$isWide ? '8px 14px' : '9px 12px'};
  transition: all 0.15s ease;
  user-select: none;
  border-radius: ${props => props.$isWide ? '8px' : '8px'};
  border: 1px solid ${props => props.$isWide ? '#f1f5f9' : '#f8fafc'};
  margin-bottom: 3px;

  &:hover {
    background: #fcfcfd;
    border-color: #e2e8f0;
  }
`;

// Wide Mode Single Horizontal Row
const WideRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 768px) {
    flex-wrap: wrap;
    gap: 6px;
  }
`;

const WideLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;

  @media (max-width: 768px) {
    width: 100%;
    flex: 1 1 100%;
    justify-content: space-between;
  }
`;

const ItemTitle = styled.div`
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DiscountTag = styled.span`
  color: #dc2626;
  font-weight: 700;
  font-size: 10px;
  background: #fef2f2;
  padding: 1px 5px;
  border-radius: 4px;
`;

const StepperControl = styled.div`
  display: inline-flex;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  height: 24px;
  overflow: hidden;
  flex-shrink: 0;

  &:focus-within {
    border-color: ${props => props.$themeColor || '#f97316'};
    background: #ffffff;
  }
`;

const StepperMinusBtn = styled.button`
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: ${props => props.$isRemove ? '#fef2f2' : '#f8fafc'};
  color: ${props => props.$isRemove ? '#ef4444' : '#ef4444'};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  &:active {
    background: #fecaca;
  }
`;

const StepperPlusBtn = styled.button`
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: #f8fafc;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover {
    background: #ffffff;
    color: ${props => props.$themeColor || '#f97316'};
  }

  &:active {
    background: #f1f5f9;
  }
`;

const StepperQtyInput = styled.input`
  width: 28px;
  min-width: 22px;
  height: 20px;
  border: none;
  background: transparent;
  text-align: center;
  font-weight: 800;
  font-size: 12px;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
  padding: 0;
  margin: 0;
  outline: none;
  cursor: text;
  -moz-appearance: textfield;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &:focus {
    background: #ffffff;
    border-radius: 2px;
    box-shadow: 0 0 0 1px ${props => props.$themeColor || '#f97316'};
  }
`;

const LineTotal = styled.div`
  font-weight: 800;
  font-size: 13px;
  color: ${props => props.$themeColor || '#f97316'};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
  min-width: 65px;
  text-align: right;
  flex-shrink: 0;
`;

const NoteToggleBtn = styled.button`
  border: 1px dashed ${props => props.$hasNote ? (props.$themeColor || '#f97316') : '#cbd5e1'};
  background: ${props => props.$hasNote 
    ? (props.$themeColor ? `${props.$themeColor}12` : '#fff7ed') 
    : 'transparent'};
  color: ${props => props.$hasNote ? (props.$themeColor || '#ea580c') : '#94a3b8'};
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 5px;
  padding: 2px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover {
    border-color: ${props => props.$themeColor || '#f97316'};
    color: ${props => props.$themeColor || '#ea580c'};
    background: #ffffff;
  }

  .clear-icon {
    margin-left: 2px;
    opacity: 0.7;
    &:hover { opacity: 1; color: #ef4444; }
  }
`;

const InlineNoteInputBox = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  max-width: 240px;

  input {
    flex: 1;
    height: 24px;
    border: 1px solid ${props => props.$themeColor || '#f97316'};
    background: #ffffff;
    border-radius: 5px;
    padding: 0 6px;
    font-size: 11px;
    color: #0f172a;
    outline: none;
    box-shadow: 0 0 0 2px ${props => props.$themeColor ? `${props.$themeColor}18` : 'rgba(249, 115, 22, 0.12)'};

    &::placeholder {
      color: #94a3b8;
    }
  }

  .save-btn {
    border: none;
    background: ${props => props.$themeColor || '#f97316'};
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 0 6px;
    height: 24px;
    border-radius: 5px;
    cursor: pointer;

    &:hover {
      opacity: 0.9;
    }
  }
`;

const EditProductBtn = styled.button`
  border: none;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  padding: 3px;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  transition: color 0.15s ease;
  flex-shrink: 0;

  &:hover {
    color: #64748b;
  }
`;

const DeleteProductBtn = styled.button`
  border: none;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  padding: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover {
    color: #ef4444;
    background: #fee2e2;
  }
`;

// Compact Mode (Two Tight Lines)
const CompactTopRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
`;

const CompactBottomRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 5px;
`;

const CompactLeftGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
`;

const CompactRightGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

export default function PosCartItem({
  item,
  cartKeyFor,
  sym = '₹',
  currencyDecimalPlaces = 2,
  theme,
  updateQty,
  removeCartItem,
  setItemQty,
  discountsEnabled,
  handleEditProductFromCart,
  setItemDescription,
  isWide = false
}) {
  const key = cartKeyFor(item);
  const [noteOpen, setNoteOpen] = useState(false);
  const [localNote, setLocalNote] = useState(item.description || '');
  const [localQty, setLocalQty] = useState(String(item.qty || 1));
  const inputRef = useRef(null);

  const hasNote = Boolean(item.description && item.description.trim());

  useEffect(() => {
    setLocalNote(item.description || '');
  }, [item.description]);

  useEffect(() => {
    setLocalQty(String(item.qty || 1));
  }, [item.qty]);

  const handleQtyChange = (e) => {
    const val = e.target.value;
    setLocalQty(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      if (typeof setItemQty === 'function') {
        setItemQty(key, parsed);
      } else if (typeof updateQty === 'function') {
        updateQty(key, parsed - item.qty);
      }
    }
  };

  const handleQtyBlur = () => {
    const parsed = parseInt(localQty, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setLocalQty(String(item.qty || 1));
      if (typeof setItemQty === 'function') {
        setItemQty(key, item.qty || 1);
      }
    } else {
      if (typeof setItemQty === 'function') {
        setItemQty(key, parsed);
      }
    }
  };

  const handleDelete = (e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof removeCartItem === 'function') {
      removeCartItem(key);
    } else if (typeof updateQty === 'function') {
      updateQty(key, -item.qty);
    }
  };

  const handleNoteToggle = (e) => {
    e.stopPropagation();
    if (!noteOpen) {
      setLocalNote(item.description || '');
      setNoteOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      handleNoteSave();
    }
  };

  const handleNoteSave = () => {
    if (typeof setItemDescription === 'function') {
      setItemDescription(key, localNote);
    }
    setNoteOpen(false);
  };

  const handleNoteClear = (e) => {
    e.stopPropagation();
    setLocalNote('');
    if (typeof setItemDescription === 'function') {
      setItemDescription(key, '');
    }
    setNoteOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNoteSave();
    } else if (e.key === 'Escape') {
      setLocalNote(item.description || '');
      setNoteOpen(false);
    }
  };

  const lineTotal = Number(item.price || 0) * Number(item.qty || 1);
  const hasDiscount = Boolean(item.discountAmount && Number(item.discountAmount) > 0);
  const discountLabel = item.discountType === 'PERCENTAGE'
    ? `${item.discountValue}%`
    : `${sym}${Number(item.discountValue || 0).toFixed(currencyDecimalPlaces)}`;

  // ── 1. WIDE MODE (Single horizontal row - executive ledger view) ──
  if (isWide) {
    return (
      <ItemWrapper $isWide={true}>
        <WideRow>
          <WideLeft>
            <ItemTitle title={item.displayName || item.name}>
              {item.displayName || item.name}
            </ItemTitle>

            {hasDiscount && <DiscountTag>-{discountLabel}</DiscountTag>}

            {!noteOpen ? (
              <NoteToggleBtn 
                type="button" 
                $hasNote={hasNote} 
                $themeColor={theme?.main}
                onClick={handleNoteToggle}
                title={hasNote ? `Note: ${item.description}` : 'Add note'}
              >
                <FaStickyNote size={8.5} />
                <span>{hasNote ? item.description : '+ Note'}</span>
                {hasNote && (
                  <span className="clear-icon" onClick={handleNoteClear} title="Remove note">
                    <FaTimes size={7} />
                  </span>
                )}
              </NoteToggleBtn>
            ) : (
              <InlineNoteInputBox $themeColor={theme?.main} onClick={e => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  type="text"
                  value={localNote}
                  onChange={e => setLocalNote(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleNoteSave}
                  placeholder="Note..."
                  maxLength={100}
                />
                <button type="button" className="save-btn" onClick={handleNoteSave}>OK</button>
              </InlineNoteInputBox>
            )}
          </WideLeft>

          <StepperControl $themeColor={theme?.main}>
            <StepperMinusBtn 
              type="button" 
              onClick={() => updateQty(key, -1)}
              title={item.qty === 1 ? "Remove item" : "Decrease quantity"}
              $isRemove={item.qty === 1}
            >
              {item.qty === 1 ? <FaTrashAlt size={7.5} /> : <FaMinus size={7.5} />}
            </StepperMinusBtn>
            <StepperQtyInput
              type="number"
              min="1"
              max="9999"
              value={localQty}
              onChange={handleQtyChange}
              onBlur={handleQtyBlur}
              onFocus={(e) => e.target.select()}
              $themeColor={theme?.main}
              title="Click or type to edit quantity"
            />
            <StepperPlusBtn 
              type="button" 
              onClick={() => updateQty(key, 1)}
              title="Increase quantity"
              $themeColor={theme?.main}
            >
              <FaPlus size={7.5} />
            </StepperPlusBtn>
          </StepperControl>

          <LineTotal $themeColor={theme?.main}>
            {sym}{lineTotal.toFixed(currencyDecimalPlaces)}
          </LineTotal>

          {typeof handleEditProductFromCart === 'function' && (
            <EditProductBtn 
              type="button" 
              onClick={() => handleEditProductFromCart(item)}
              title="Edit product"
            >
              <FaEdit size={10.5} />
            </EditProductBtn>
          )}

          <DeleteProductBtn 
            type="button" 
            onClick={handleDelete}
            title="Remove item from cart"
          >
            <FaTrashAlt size={10.5} />
          </DeleteProductBtn>
        </WideRow>
      </ItemWrapper>
    );
  }

  // ── 2. COMPACT MODE (Two tight, elegant lines - zero bulky feel) ──
  return (
    <ItemWrapper $isWide={false}>
      <CompactTopRow>
        <ItemTitle title={item.displayName || item.name}>
          {item.displayName || item.name}
        </ItemTitle>
        <LineTotal $themeColor={theme?.main}>
          {sym}{lineTotal.toFixed(currencyDecimalPlaces)}
        </LineTotal>
      </CompactTopRow>

      <CompactBottomRow>
        <CompactLeftGroup>
          {hasDiscount && <DiscountTag>-{discountLabel}</DiscountTag>}

          {!noteOpen ? (
            <NoteToggleBtn 
              type="button" 
              $hasNote={hasNote} 
              $themeColor={theme?.main}
              onClick={handleNoteToggle}
              title={hasNote ? `Note: ${item.description}` : 'Add note'}
            >
              <FaStickyNote size={8.5} />
              <span>{hasNote ? item.description : '+ Note'}</span>
              {hasNote && (
                <span className="clear-icon" onClick={handleNoteClear} title="Remove note">
                  <FaTimes size={7} />
                </span>
              )}
            </NoteToggleBtn>
          ) : (
            <InlineNoteInputBox $themeColor={theme?.main} onClick={e => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={localNote}
                onChange={e => setLocalNote(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleNoteSave}
                placeholder="Note..."
                maxLength={100}
              />
              <button type="button" className="save-btn" onClick={handleNoteSave}>OK</button>
            </InlineNoteInputBox>
          )}
        </CompactLeftGroup>

        <CompactRightGroup>
          <StepperControl $themeColor={theme?.main}>
            <StepperMinusBtn 
              type="button" 
              onClick={() => updateQty(key, -1)}
              title={item.qty === 1 ? "Remove item" : "Decrease quantity"}
              $isRemove={item.qty === 1}
            >
              {item.qty === 1 ? <FaTrashAlt size={7.5} /> : <FaMinus size={7.5} />}
            </StepperMinusBtn>
            <StepperQtyInput
              type="number"
              min="1"
              max="9999"
              value={localQty}
              onChange={handleQtyChange}
              onBlur={handleQtyBlur}
              onFocus={(e) => e.target.select()}
              $themeColor={theme?.main}
              title="Click or type to edit quantity"
            />
            <StepperPlusBtn 
              type="button" 
              onClick={() => updateQty(key, 1)}
              title="Increase quantity"
              $themeColor={theme?.main}
            >
              <FaPlus size={7.5} />
            </StepperPlusBtn>
          </StepperControl>

          {typeof handleEditProductFromCart === 'function' && (
            <EditProductBtn 
              type="button" 
              onClick={() => handleEditProductFromCart(item)}
              title="Edit product"
            >
              <FaEdit size={10.5} />
            </EditProductBtn>
          )}

          <DeleteProductBtn 
            type="button" 
            onClick={handleDelete}
            title="Remove item from cart"
          >
            <FaTrashAlt size={10.5} />
          </DeleteProductBtn>
        </CompactRightGroup>
      </CompactBottomRow>
    </ItemWrapper>
  );
}
