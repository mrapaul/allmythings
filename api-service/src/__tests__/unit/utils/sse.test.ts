import { describe, expect, it } from 'vitest';
import { encodeSseEvent } from '../../../utils/sse';

describe('encodeSseEvent', () => {
  it('emits event + data + blank line', () => {
    const s = encodeSseEvent('item', { label: 'Sofa' });
    expect(s).toBe('event: item\ndata: {"label":"Sofa"}\n\n');
  });

  it('escapes embedded newlines', () => {
    const s = encodeSseEvent('msg', 'line1\nline2');
    expect(s).toBe('event: msg\ndata: "line1\\nline2"\n\n');
  });

  it('omits event line for the default event', () => {
    const s = encodeSseEvent(null, { x: 1 });
    expect(s).toBe('data: {"x":1}\n\n');
  });
});
