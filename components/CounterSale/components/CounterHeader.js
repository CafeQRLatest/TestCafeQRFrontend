import React from 'react';
import { FaArrowLeft, FaHistory, FaTh, FaList, FaMinus, FaPlus } from 'react-icons/fa';
import * as S from '../CounterSale.styles';
import PremiumDateTimePicker from '../../PremiumDateTimePicker';

export default function CounterHeader({
  onBack,
  initialTable,
  catalog,
  order,
  ui,
  router
}) {
  const { productListingOn, handleToggleProductListing } = catalog;
  const { mode: orderMode, setMode: setOrderMode, activeOrderMode, kitchenEnabled, hideKitchenForTakeaway, orderDateTime, setOrderDateTime, setIsDateTimeManuallyEdited } = order;
  const { zoomLevel, handleZoom, THEME: theme } = ui;

  return (
    <S.CsCounterHeader>
      <S.CsHeaderLeft>
        <S.CsBackBtn onClick={onBack} aria-label="Go back"><FaArrowLeft/></S.CsBackBtn>
        <S.CsTitleGroup $accentColor={theme.main}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <S.CsTitle>
              {initialTable
                ? (initialTable.tableNumber === 'COUNTER'
                  ? (initialTable.orderType === 'DELIVERY' ? 'Delivery Order' : 'Takeaway Order')
                  : `Table ${initialTable.tableNumber}`)
                : 'Sale Order'}
            </S.CsTitle>
          </div>
        </S.CsTitleGroup>
      </S.CsHeaderLeft>

      {kitchenEnabled && !hideKitchenForTakeaway && (
        <S.CsHeaderModeSwitch>
          <S.CsModeToggleBtn
            $active={activeOrderMode === 'kitchen'}
            $themeColor="#f97316"
            onClick={() => setOrderMode('kitchen')}
          >
            Kitchen
          </S.CsModeToggleBtn>
          <S.CsModeToggleBtn 
            $active={activeOrderMode === 'settle'}
            $themeColor="#16a34a" 
            onClick={() => setOrderMode('settle')}
          >
            Settle
          </S.CsModeToggleBtn>
        </S.CsHeaderModeSwitch>
      )}

      <S.CsHeaderModeSwitch style={{ marginLeft: '4px' }}>
        <S.CsModeToggleBtn 
          $active={productListingOn} 
          $themeColor={theme.main}
          onClick={() => handleToggleProductListing(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          title="Standard View"
        >
          <FaTh size={11} /> Standard
        </S.CsModeToggleBtn>
        <S.CsModeToggleBtn 
          $active={!productListingOn} 
          $themeColor={theme.main}
          onClick={() => handleToggleProductListing(false)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          title="Counter View"
        >
          <FaList size={11} /> Counter
        </S.CsModeToggleBtn>
      </S.CsHeaderModeSwitch>

      {/* Sales History shortcut */}
      <S.CsHeaderShortcutBtn
        type="button"
        onClick={() => router.push('/owner/orders?tab=completed')}
        style={{ flexShrink: 0 }}
        $themeColor={theme.main}
        $themeColorDark={theme.dark}
      >
        <FaHistory size={13} />
        <S.CsHeaderShortcutLabel>Sales History</S.CsHeaderShortcutLabel>
      </S.CsHeaderShortcutBtn>

      <S.CsZoomControl onClick={e => e.stopPropagation()}>
        <S.CsZoomBtn
          type="button"
          onClick={() => handleZoom(-0.1)}
          disabled={zoomLevel <= 0.8}
          $themeColor={theme.main}
          $softColor={theme.soft}
          title="Zoom Out"
        >
          <FaMinus size={8} />
        </S.CsZoomBtn>
        <S.CsZoomLabel>{Math.round(zoomLevel * 100)}%</S.CsZoomLabel>
        <S.CsZoomBtn
          type="button"
          onClick={() => handleZoom(0.1)}
          disabled={zoomLevel >= 1.4}
          $themeColor={theme.main}
          $softColor={theme.soft}
          title="Zoom In"
        >
          <FaPlus size={8} />
        </S.CsZoomBtn>
      </S.CsZoomControl>

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
          themeColor={theme.main}
        />
      </div>
    </S.CsCounterHeader>
  );
}
