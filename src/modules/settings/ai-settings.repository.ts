import type {
  AiPromptVersion,
  PrismaClient
} from "../../generated/prisma/client.js";

function isRetryableTransactionConflict(
  error: unknown
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

export class AiSettingsRepository {
  public constructor(
    private readonly prisma: PrismaClient
  ) {}

  public async findActive(): Promise<AiPromptVersion | null> {
    return this.prisma.aiPromptVersion.findFirst({
      where: { isActive: true },
      orderBy: [
        { version: "desc" },
        { createdAt: "desc" }
      ]
    });
  }

  public async createVersion(
    companyPrompt: string,
    createdBy: string
  ): Promise<AiPromptVersion> {
    // Serializable transactions plus bounded retries make concurrent saves safe.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const latest =
              await transaction.aiPromptVersion.aggregate({
                _max: { version: true }
              });

            await transaction.aiPromptVersion.updateMany({
              where: { isActive: true },
              data: { isActive: false }
            });

            return transaction.aiPromptVersion.create({
              data: {
                version: (latest._max.version ?? 0) + 1,
                companyPrompt,
                isActive: true,
                createdBy
              }
            });
          },
          { isolationLevel: "Serializable" }
        );
      } catch (error) {
        if (
          attempt === 2 ||
          !isRetryableTransactionConflict(error)
        ) {
          throw error;
        }
      }
    }

    throw new Error("Prompt version transaction retry exhausted");
  }
}
