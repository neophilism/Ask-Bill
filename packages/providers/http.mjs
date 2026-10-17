import {ProviderError, failProvider as fail} from './errors.mjs';

const ENDPOINTS = new Set([
  'https://api.openai.com/v1/responses',
  'https://api.openai.com/v1/audio/speech',
  'https://api.openai.com/v1/audio/transcriptions'
]);
export const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;

export function checkProviderSignal(signal) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail('INVALID_SIGNAL');
  if (signal?.aborted) fail('REQUEST_ABORTED');
}

export function configureProvider({apiKey, model, fetchImpl = globalThis.fetch,
  enabled = false, dataProtectionVerified = false, timeoutMs = 20000,
  maxOutputBytes = 150000} = {}) {
  if (enabled !== true) fail('LIVE_PROVIDER_DISABLED');
  if (dataProtectionVerified !== true) fail('PROVIDER_DATA_PROTECTION_REQUIRED');
  if (typeof apiKey !== 'string' || apiKey.length < 12 || apiKey.length > 300 ||
      /[^\x21-\x7e]/.test(apiKey)) fail('LIVE_CREDENTIAL_MISSING');
  if (typeof model !== 'string' || !MODEL_ID.test(model) || typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000 ||
      !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1000 ||
      maxOutputBytes > 10 * 1024 * 1024) fail('PROVIDER_CONFIG');
  // This object is private to adapters and must never be returned by capability discovery.
  return {apiKey, model, fetchImpl, timeoutMs, maxOutputBytes};
}

/** One request, no automatic paid retries. The deadline covers headers AND every body chunk. */
export async function requestProviderBytes(config, {endpoint, body, signal,
  contentType = 'application/json', accept = 'application/json', acceptedTypes} = {}) {
  checkProviderSignal(signal);
  if (!ENDPOINTS.has(endpoint)) fail('PROVIDER_ENDPOINT_FORBIDDEN');
  const abort = new AbortController();
  let interrupted = false, reason = 'REQUEST_ABORTED', rejectInterrupted;
  let response, reader, completed = false;
  const interruption = new Promise((_, reject) => { rejectInterrupted = reject; });
  interruption.catch(() => {}); // Also observed if cancellation wins before a read begins.
  const interrupt = code => {
    if (interrupted) return;
    interrupted = true; reason = code; abort.abort();
    rejectInterrupted(new ProviderError(code));
  };
  const forwardAbort = () => interrupt('REQUEST_ABORTED');
  signal?.addEventListener('abort', forwardAbort, {once:true});
  const timer = setTimeout(() => interrupt('PROVIDER_TIMEOUT'), config.timeoutMs);
  const bounded = promise => Promise.race([promise, interruption]);
  const cancel = value => {
    try { Promise.resolve(value?.cancel?.()).catch(() => {}); } catch { /* discard only */ }
  };
  try {
    // Caller cancellation can happen between the preflight check and listener setup.
    if (signal?.aborted) interrupt('REQUEST_ABORTED');
    if (interrupted) fail(reason);
    const headers = {Authorization:'Bearer ' + config.apiKey, Accept:accept};
    if (contentType) headers['Content-Type'] = contentType;
    const pending = Promise.resolve().then(() => config.fetchImpl(endpoint, {
      method:'POST', redirect:'manual', signal:abort.signal, headers, body
    })).then(value => {
      // Close a late response even when a defective transport ignores cancellation.
      if (interrupted) cancel(value?.body);
      return value;
    });
    response = await bounded(pending);
    if (interrupted) fail(reason);
    if (!response || !Number.isSafeInteger(response.status) ||
        typeof response.headers?.get !== 'function') fail('PROVIDER_RESPONSE_INVALID');
    if (response.status !== 200) {
      fail(response.status === 429 ? 'PROVIDER_RATE_LIMITED' :
        response.status === 401 || response.status === 403 ? 'PROVIDER_UNAUTHORIZED' :
        response.status === 400 || response.status === 404 ? 'PROVIDER_REJECTED_REQUEST' : 'PROVIDER_UNAVAILABLE');
    }
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) ||
        !Number.isSafeInteger(Number(declared)) || Number(declared) > config.maxOutputBytes)) fail('PROVIDER_SIZE_LIMIT');
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (acceptedTypes && !acceptedTypes.includes(type)) fail('PROVIDER_CONTENT_TYPE');
    // A bounded streaming body is required. arrayBuffer() fallback could allocate without a limit.
    if (typeof response.body?.getReader !== 'function') fail('PROVIDER_RESPONSE_INVALID');
    reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const item = await bounded(reader.read());
      if (interrupted) fail(reason);
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) fail('PROVIDER_RESPONSE_INVALID');
      size += item.value.byteLength;
      if (size > config.maxOutputBytes) fail('PROVIDER_SIZE_LIMIT');
      chunks.push(Buffer.from(item.value));
    }
    if (interrupted) fail(reason);
    completed = true;
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    fail(interrupted ? reason : 'PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
    if (!completed) {
      abort.abort();
      if (reader) cancel(reader); else cancel(response?.body);
    }
    try { reader?.releaseLock(); } catch { /* pending read is cancelled */ }
  }
}

export function parseProviderJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { fail('PROVIDER_JSON_INVALID'); }
}

/** The provider may refuse outside the requested JSON schema. Never display refusal text raw. */
export function readResponseObject(response) {
  if (response?.status !== 'completed' || !Array.isArray(response.output)) fail('PROVIDER_INCOMPLETE');
  if (response.output.length < 1 || response.output.length > 10) fail('PROVIDER_OUTPUT_INVALID');
  const parts = [];
  for (const output of response.output) {
    if (output?.type === 'reasoning') continue;
    if (output?.type !== 'message' || output.role !== 'assistant' ||
        !Array.isArray(output.content) || output.content.length > 5) fail('PROVIDER_OUTPUT_INVALID');
    if (output.status !== undefined && output.status !== 'completed') fail('PROVIDER_INCOMPLETE');
    for (const part of output.content) {
      if (part?.type === 'refusal') fail('PROVIDER_REFUSED');
      if (part?.type !== 'output_text' || typeof part.text !== 'string' ||
          part.text.length > 100000) fail('PROVIDER_OUTPUT_INVALID');
      parts.push(part.text);
    }
  }
  if (parts.length !== 1) fail('PROVIDER_OUTPUT_INVALID');
  try { return JSON.parse(parts[0]); } catch { fail('PROVIDER_OUTPUT_INVALID'); }
}
