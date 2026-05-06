export interface RawSseEvent {
  event: string;
  data: string;
}

export function splitSseEvents(buf: string): RawSseEvent[] {
  const events: RawSseEvent[] = [];
  const blocks = buf.replace(/\r\n/g, '\n').split('\n\n');
  for (const block of blocks) {
    if (!block.trim()) continue;
    if (block.startsWith(':')) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (dataLines.length === 0) continue;
    events.push({ event, data: dataLines.join('\n') });
  }
  return events;
}

export function parseSseChunks(buf: string): { events: RawSseEvent[]; remainder: string } {
  const lastBoundary = buf.lastIndexOf('\n\n');
  if (lastBoundary < 0) return { events: [], remainder: buf };
  const complete = buf.slice(0, lastBoundary + 2);
  const remainder = buf.slice(lastBoundary + 2);
  return { events: splitSseEvents(complete), remainder };
}
