import { IAIProvider } from './provider.interface.js';
import { AIProviderError } from './errors/provider.error.js';

export interface ProviderEntry {
  readonly provider: IAIProvider;
  readonly isEnabled: boolean;
  readonly registeredAt: Date;
}

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private readonly providers = new Map<string, ProviderEntry>();

  private constructor() {}

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  public register(provider: IAIProvider, isEnabled: boolean = true): void {
    if (this.providers.has(provider.id)) {
      throw new AIProviderError({
        code: 'PROVIDER_INTERNAL',
        providerId: provider.id,
        message: `Provider with id "${provider.id}" is already registered. Duplicate IDs are prohibited.`,
      });
    }

    this.providers.set(provider.id, {
      provider,
      isEnabled,
      registeredAt: new Date(),
    });
  }

  public get(id: string): IAIProvider | undefined {
    const entry = this.providers.get(id);
    return entry && entry.isEnabled ? entry.provider : undefined;
  }

  public getRawEntry(id: string): ProviderEntry | undefined {
    return this.providers.get(id);
  }

  public setEnabled(id: string, enabled: boolean): void {
    const entry = this.providers.get(id);
    if (!entry) {
      throw new AIProviderError({
        code: 'PROVIDER_INTERNAL',
        providerId: id,
        message: `Cannot toggle provider "${id}": not found in registry`,
      });
    }
    this.providers.set(id, {
      ...entry,
      isEnabled: enabled,
    });
  }

  public unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  public listRegistered(): readonly { id: string; name: string; type: string; isEnabled: boolean }[] {
    return Array.from(this.providers.values()).map((e) => ({
      id: e.provider.id,
      name: e.provider.name,
      type: e.provider.type,
      isEnabled: e.isEnabled,
    }));
  }

  public clear(): void {
    this.providers.clear();
  }
}

