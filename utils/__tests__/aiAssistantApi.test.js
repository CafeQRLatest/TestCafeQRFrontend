import { parseSseFrame, isAiAssistantEnabled } from '../aiAssistantApi';
import { toBlocks } from '../../components/Assistant/AnswerText';

jest.mock('../api', () => ({ __esModule: true, default: { post: jest.fn() }, getApiUrl: () => 'http://localhost:8080' }));

describe('parseSseFrame', () => {
  it('parses named events with JSON data', () => {
    expect(parseSseFrame('event:token\ndata:{"text":"Hello"}')).toEqual({ event: 'token', data: { text: 'Hello' } });
    expect(parseSseFrame('event: done\ndata: {"conversationId":"c1"}')).toEqual({ event: 'done', data: { conversationId: 'c1' } });
  });

  it('ignores frames without data', () => {
    expect(parseSseFrame(': keep-alive')).toBeNull();
    expect(parseSseFrame('')).toBeNull();
  });
});

describe('AnswerText toBlocks', () => {
  it('splits paragraphs, lists and tables', () => {
    const blocks = toBlocks([
      'Today you sold **AED 4,500**.',
      '',
      '- Coffee: 30',
      '- Tea: 50',
      '',
      '| Item | Qty |',
      '|---|---|',
      '| Tea | 50 |',
    ].join('\n'));
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul', 'table']);
    expect(blocks[1].items).toEqual(['Coffee: 30', 'Tea: 50']);
    expect(blocks[2].header).toEqual(['Item', 'Qty']);
    expect(blocks[2].rows).toEqual([['Tea', '50']]);
  });

  it('keeps model text as plain text (no HTML)', () => {
    const blocks = toBlocks('<img src=x onerror=alert(1)>');
    expect(blocks).toEqual([{ type: 'p', text: '<img src=x onerror=alert(1)>' }]);
  });
});

describe('isAiAssistantEnabled (Settings > Enable MCP)', () => {
  it('is off everywhere while Ask CafeQR is not released, even if the setting is on', () => {
    expect(isAiAssistantEnabled({ mcpEnabled: true })).toBe(false);
    expect(isAiAssistantEnabled({ mcpEnabled: false })).toBe(false);
    expect(isAiAssistantEnabled({})).toBe(false);
    expect(isAiAssistantEnabled(null)).toBe(false);
  });
});
