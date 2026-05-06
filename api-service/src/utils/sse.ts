export function encodeSseEvent(event: string | null, data: unknown): string {
  const payload = JSON.stringify(data);
  const head = event ? `event: ${event}\n` : '';
  return `${head}data: ${payload}\n\n`;
}

export const SSE_KEEPALIVE = ':keepalive\n\n';
