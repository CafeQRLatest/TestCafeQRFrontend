import { applyCategoryOrder, keepCategoryOrder } from '../categoryOrder';

describe('applyCategoryOrder', () => {
  test('orders extracted categories by the server order, extras appended, ALL first', () => {
    const extracted = ['ALL', 'Bakery', 'Coffee', 'Snacks'];
    const ordered = [{ name: 'Coffee' }, { name: 'Snacks' }];
    expect(applyCategoryOrder(extracted, ordered)).toEqual(['ALL', 'Coffee', 'Snacks', 'Bakery']);
  });

  test('falls back to the extracted list when the server order is empty or missing', () => {
    const extracted = ['ALL', 'Bakery', 'Coffee'];
    expect(applyCategoryOrder(extracted, [])).toEqual(extracted);
    expect(applyCategoryOrder(extracted, undefined)).toEqual(extracted);
  });

  test('drops server categories that have no products on this screen', () => {
    expect(applyCategoryOrder(['ALL', 'Coffee'], [{ name: 'Juice' }, { name: 'Coffee' }]))
      .toEqual(['ALL', 'Coffee']);
  });

  test('matches names case-insensitively and keeps the extracted spelling', () => {
    expect(applyCategoryOrder(['ALL', 'Coffee', 'juice'], [{ name: 'JUICE' }, { name: 'coffee' }]))
      .toEqual(['ALL', 'juice', 'Coffee']);
  });
});

describe('keepCategoryOrder', () => {
  test('keeps incoming order and removes blanks and duplicates', () => {
    expect(keepCategoryOrder([{ name: 'Snacks' }, 'Coffee', { name: 'Snacks' }, null, { name: '' }]))
      .toEqual(['Snacks', 'Coffee']);
  });
  test('non-array input gives an empty list', () => {
    expect(keepCategoryOrder(undefined)).toEqual([]);
  });
});
