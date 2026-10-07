import { buildProcessedLines, buildOrderPayload } from '../orderPayload';

describe('orderPayload domain tests', () => {
  test('extracts categoryName string when product category is an object { id, name }', () => {
    const cart = [
      {
        id: 'p1',
        productId: 'p1',
        name: 'black tea',
        price: 10,
        qty: 1,
        category: { id: 'cat-1', name: 'CRUSH MILK' },
        categoryName: undefined
      },
      {
        id: 'p2',
        productId: 'p2',
        name: 'tea',
        price: 15,
        qty: 1,
        categoryName: 'Beverages'
      }
    ];

    const totals = {
      processed_items: [
        {
          productId: 'p1',
          name: 'black tea',
          unit_price: 10,
          quantity: 1,
          category: { id: 'cat-1', name: 'CRUSH MILK' }
        },
        {
          productId: 'p2',
          name: 'tea',
          unit_price: 15,
          quantity: 1,
          categoryName: 'Beverages'
        }
      ]
    };

    const lines = buildProcessedLines({ cart, totals, config: {} });

    expect(lines).toHaveLength(2);
    // Line 0: category was an object { id, name }, must extract string name 'CRUSH MILK'
    expect(lines[0].categoryName).toBe('CRUSH MILK');
    expect(typeof lines[0].categoryName).toBe('string');

    // Line 1: categoryName was already a string 'Beverages'
    expect(lines[1].categoryName).toBe('Beverages');
    expect(typeof lines[1].categoryName).toBe('string');
  });

  test('order payload lines contains pure strings for categoryName', () => {
    const cart = [
      {
        id: 'p1',
        name: 'biriyani rice',
        price: 50,
        qty: 1,
        category: { id: 'cat-rice', name: 'Rice' }
      }
    ];

    const totals = {
      total_inc_tax: 50,
      total_tax: 0,
      processed_items: [
        {
          productId: 'p1',
          name: 'biriyani rice',
          unit_price: 50,
          quantity: 1,
          category: { id: 'cat-rice', name: 'Rice' }
        }
      ]
    };

    const payload = buildOrderPayload({
      orgId: 'org-1',
      cart,
      totals,
      kitchenEnabled: false
    });

    expect(payload.lines[0].categoryName).toBe('Rice');
    expect(typeof payload.lines[0].categoryName).toBe('string');
  });
});
