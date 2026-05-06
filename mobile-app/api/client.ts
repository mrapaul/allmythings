import { context, trace } from '@opentelemetry/api';
import Constants from 'expo-constants';
import { ofetch } from 'ofetch';

interface ClientConfig {
  baseUrl: string;
  apiKey?: string | undefined;
}

function readConfig(): ClientConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; apiKey?: string };
  return {
    baseUrl: extra.apiBaseUrl ?? 'http://localhost:14000',
    apiKey: extra.apiKey,
  };
}

export const apiFetch = ofetch.create({
  baseURL: readConfig().baseUrl,
  retry: 1,
  retryDelay: 250,
  onRequest({ options }) {
    const cfg = readConfig();
    const headers = new Headers(options.headers ?? {});
    if (cfg.apiKey) headers.set('authorization', `Bearer ${cfg.apiKey}`);
    options.headers = headers;
  },
});

export function makeTraceparent(): string {
  // Prefer the active OTel span so server traces stitch back to the mobile
  // span that triggered them. Falls back to a random-id traceparent when no
  // span is active (e.g., background fetches outside a `withSpan` scope).
  const span = trace.getSpan(context.active());
  if (span) {
    const sc = span.spanContext();
    return `00-${sc.traceId}-${sc.spanId}-01`;
  }
  const hex = (n: number) => {
    let out = '';
    for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  };
  return `00-${hex(32)}-${hex(16)}-01`;
}
