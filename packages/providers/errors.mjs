/** Fixed, content-free error codes. Never attach a provider response or a credential. */
export class ProviderError extends Error {
  constructor(code) { super(code); this.name = 'ProviderError'; this.code = code; }
}
export const failProvider = code => { throw new ProviderError(code); };
