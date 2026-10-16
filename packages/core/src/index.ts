/** Shared Ask Bill bootstrap state. Runtime feature gates belong to later units. */
export const PRODUCT_ID = 'ask-bill' as const;
export type Surface = 'web' | 'api' | 'worker';
export type BootstrapPhase = 'scaffold';
export interface BootstrapState {
  readonly productId: typeof PRODUCT_ID;
  readonly surface: Surface;
  readonly phase: BootstrapPhase;
  readonly live: false;
  readonly providerCredentialsConfigured: false;
}
export function bootstrapState(surface: Surface): Readonly<BootstrapState> {
  return Object.freeze({
    productId: PRODUCT_ID,
    surface,
    phase: 'scaffold' as const,
    live: false as const,
    providerCredentialsConfigured: false as const
  });
}
