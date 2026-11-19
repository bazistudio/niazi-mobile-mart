declare const process: {
  env: Record<string, string | undefined>;
};

export interface SecretResolver {
  resolveSecret(secretRef: string): Promise<string | undefined>;
}

export class EnvSecretResolver implements SecretResolver {
  constructor(private readonly prefix: string = '') {}

  public async resolveSecret(secretRef: string): Promise<string | undefined> {
    if (!secretRef || typeof secretRef !== 'string') {
      return undefined;
    }
    // Only resolve from environment variable reference names
    const envVarName = this.prefix ? `${this.prefix}_${secretRef}` : secretRef;
    const value = process.env[envVarName];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }
}

export class SecretVault {
  private static instance: SecretVault;
  private resolver: SecretResolver;

  private constructor() {
    this.resolver = new EnvSecretResolver();
  }

  public static getInstance(): SecretVault {
    if (!SecretVault.instance) {
      SecretVault.instance = new SecretVault();
    }
    return SecretVault.instance;
  }

  public setResolver(resolver: SecretResolver): void {
    this.resolver = resolver;
  }

  public async getSecret(secretRef?: string): Promise<string | undefined> {
    if (!secretRef) {
      return undefined;
    }
    return this.resolver.resolveSecret(secretRef);
  }
}

