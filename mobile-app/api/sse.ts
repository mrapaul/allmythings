/**
 * Incremental SSE (server-sent events) decoder.
 *
 * The scout stream is consumed over XMLHttpRequest (RN's fetch has no usable
 * streaming body), so bytes arrive as arbitrary `responseText` prefixes. The
 * parser buffers partial data and yields only complete messages — wire format
 * matches the server's encodeSseEvent: `event: <name>\ndata: <json>\n\n`,
 * with `:keepalive` comment blocks that must be ignored.
 */

export interface SseMessage {
  /** null when the block carried no event: field (the server always sets one). */
  event: string | null;
  /** Raw data payload (usually a single JSON line). */
  data: string;
}

export interface SseParser {
  /** Feeds a text chunk; returns every message completed by it. */
  feed(chunk: string): SseMessage[];
}

export function createSseParser(): SseParser {
  let buffer = '';
  return {
    feed(chunk: string): SseMessage[] {
      buffer += chunk;
      const messages: SseMessage[] = [];
      // Blocks are separated by a blank line; tolerate CRLF from proxies.
      const normalized = buffer.replace(/\r\n/g, '\n');
      let sep = normalized.indexOf('\n\n');
      buffer = normalized;
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        // Keep the un-normalized remainder for the next feed.
        buffer = buffer.slice(sep + 2);
        const message = parseBlock(block);
        if (message) messages.push(message);
        sep = buffer.indexOf('\n\n');
      }
      return messages;
    },
  };
}

function parseBlock(block: string): SseMessage | null {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue; // comment / keepalive
    if (line === '') continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // A single leading space after the colon is part of the format, not data.
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}
