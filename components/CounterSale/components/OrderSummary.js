import React from 'react';
import * as S from '../CounterSale.styles';

export default function OrderSummary({
  totals,
  roundOffPreview,
  config,
  sym,
  theme,
  currencyDecimalPlaces
}) {
  return (
    <>
      <S.CsSummaryRow>
        <span>Gross Total</span>
        <span>{sym}{totals.line_subtotal.toFixed(currencyDecimalPlaces)}</span>
      </S.CsSummaryRow>
      {totals.discount_amount > 0 && (
        <S.CsSummaryRow style={{ color: '#dc2626' }}>
          <span>Discount</span>
          <span>-{sym}{totals.discount_amount.toFixed(currencyDecimalPlaces)}</span>
        </S.CsSummaryRow>
      )}
      {config?.taxEnabled && (
        <S.CsSummaryRow>
          <span>Subtotal</span>
          <span>{sym}{totals.taxable_amount.toFixed(currencyDecimalPlaces)}</span>
        </S.CsSummaryRow>
      )}
      {config?.taxEnabled && (totals.total_tax_added > 0 || totals.total_tax_included > 0) && (
        <S.CsSummaryRow>
          <span>Tax Amount</span>
          <span>{sym}{(totals.total_tax_added + totals.total_tax_included).toFixed(currencyDecimalPlaces)}</span>
        </S.CsSummaryRow>
      )}
      {config?.roundOffEnabled && config?.roundOffMode === 'automatic' && roundOffPreview !== 0 && !config?.isCredit && !config?.isCreditSale && (
        <S.CsSummaryRow style={{ color: '#94a3b8' }}>
          <span>Round Off</span>
          <span>{(roundOffPreview > 0 ? '+' : '')}{sym}{Math.abs(roundOffPreview).toFixed(currencyDecimalPlaces)}</span>
        </S.CsSummaryRow>
      )}
    </>
  );
}
