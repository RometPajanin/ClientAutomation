import { AiSettingsRepository } from "./ai-settings.repository.js";
import type { UpdateAiSettingsInput } from "./ai-settings.schemas.js";

function toSettingsResponse(
  setting: {
    companyPrompt: string;
    version: number;
    createdAt: Date;
  } | null
) {
  return {
    companyPrompt: setting?.companyPrompt ?? "",
    version: setting?.version ?? null,
    updatedAt: setting?.createdAt ?? null
  };
}

export class AiSettingsService {
  public constructor(
    private readonly repository: AiSettingsRepository
  ) {}

  public async getActive() {
    return toSettingsResponse(
      await this.repository.findActive()
    );
  }

  public async update(
    input: UpdateAiSettingsInput,
    createdBy: string
  ) {
    const created = await this.repository.createVersion(
      input.companyPrompt,
      createdBy
    );

    return toSettingsResponse(created);
  }
}
