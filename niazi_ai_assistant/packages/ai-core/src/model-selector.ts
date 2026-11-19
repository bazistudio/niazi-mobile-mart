import { AIModel, validateCapabilities, CapabilityRequirement } from '@niazi-ai/types';
import { ModelRegistrationConfig } from '@niazi-ai/config';

export class ModelSelector {
  private readonly models = new Map<string, AIModel>();

  constructor(initialModels?: readonly ModelRegistrationConfig[]) {
    if (initialModels) {
      for (const m of initialModels) {
        if (m.enabled) {
          this.registerModel({
            id: m.id,
            modelId: m.modelId,
            providerId: m.providerId,
            displayName: m.displayName,
            capabilities: m.capabilities,
            description: m.description,
            isAvailable: true,
          });
        }
      }
    }
  }

  public registerModel(model: AIModel): void {
    this.models.set(model.id, model);
  }

  public getModel(id: string): AIModel | undefined {
    return this.models.get(id);
  }

  public listModels(): readonly AIModel[] {
    return Array.from(this.models.values());
  }

  public findCapableModel(
    requirements: CapabilityRequirement,
    preferredProviderId?: string
  ): AIModel | undefined {
    const candidates = Array.from(this.models.values()).filter((m) => {
      if (!m.isAvailable) return false;
      if (preferredProviderId && m.providerId !== preferredProviderId) return false;
      const res = validateCapabilities(m.capabilities, requirements);
      return res.satisfied;
    });

    if (candidates.length > 0) {
      return candidates[0];
    }

    // If preferred provider not satisfied, try any provider
    if (preferredProviderId) {
      return this.findCapableModel(requirements);
    }

    return undefined;
  }
}

