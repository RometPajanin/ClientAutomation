import type { PrismaClient } from "../../generated/prisma/client.js";

export interface StoredAdminSession {
  id: string;
  tokenHash: string;
  username: string;
  expiresAt: Date;
}

export class AdminSessionRepository {
  public constructor(
    private readonly prisma: PrismaClient
  ) {}

  public async create(input: {
    tokenHash: string;
    username: string;
    expiresAt: Date;
  }): Promise<StoredAdminSession> {
    return this.prisma.adminSession.create({
      data: input,
      select: {
        id: true,
        tokenHash: true,
        username: true,
        expiresAt: true
      }
    });
  }

  public async findActive(
    tokenHash: string,
    now: Date
  ): Promise<StoredAdminSession | null> {
    return this.prisma.adminSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      select: {
        id: true,
        tokenHash: true,
        username: true,
        expiresAt: true
      }
    });
  }

  public async revoke(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null
      },
      data: { revokedAt: now }
    });
  }

  public async deleteExpired(now: Date): Promise<void> {
    await this.prisma.adminSession.deleteMany({
      where: { expiresAt: { lte: now } }
    });
  }
}
