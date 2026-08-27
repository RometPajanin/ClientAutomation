import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";

import type { AdminLoginInput } from "./auth.schemas.js";
import {
  AdminSessionRepository,
  type StoredAdminSession
} from "./auth.repository.js";

interface ParsedScryptHash {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  expected: Buffer;
}

export interface CreatedAdminSession extends StoredAdminSession {
  rawToken: string;
  csrfToken: string;
}

function parsePasswordHash(encoded: string): ParsedScryptHash {
  const [algorithm, cost, blockSize, parallelization, salt, expected] =
    encoded.split("$");

  if (
    algorithm !== "scrypt" ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !salt ||
    !expected
  ) {
    throw new Error("ADMIN_PASSWORD_HASH is malformed");
  }

  const parsed = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    salt: Buffer.from(salt, "base64url"),
    expected: Buffer.from(expected, "base64url")
  };

  if (
    !Number.isInteger(parsed.cost) ||
    parsed.cost < 2 ** 13 ||
    parsed.cost > 2 ** 18 ||
    (parsed.cost & (parsed.cost - 1)) !== 0 ||
    !Number.isInteger(parsed.blockSize) ||
    parsed.blockSize < 1 ||
    parsed.blockSize > 32 ||
    !Number.isInteger(parsed.parallelization) ||
    parsed.parallelization < 1 ||
    parsed.parallelization > 16 ||
    parsed.salt.length < 16 ||
    parsed.expected.length < 32
  ) {
    throw new Error("ADMIN_PASSWORD_HASH parameters are unsafe");
  }

  return parsed;
}

function safeStringEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function derivePassword(
  password: string,
  config: ParsedScryptHash
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      config.salt,
      config.expected.length,
      {
        N: config.cost,
        r: config.blockSize,
        p: config.parallelization,
        maxmem: 64 * 1024 * 1024
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      }
    );
  });
}

function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}

export class AdminAuthService {
  private readonly passwordHash: ParsedScryptHash;

  public constructor(
    private readonly repository: AdminSessionRepository,
    private readonly options: {
      username: string;
      passwordHash: string;
      sessionSecret: string;
      sessionTtlSeconds: number;
    }
  ) {
    this.passwordHash = parsePasswordHash(options.passwordHash);
  }

  public async login(
    credentials: AdminLoginInput,
    now = new Date()
  ): Promise<CreatedAdminSession | null> {
    // Always derive the password, even for a wrong username, to avoid a cheap
    // username-enumeration timing signal.
    const derived = await derivePassword(
      credentials.password,
      this.passwordHash
    );
    const passwordMatches = timingSafeEqual(
      derived,
      this.passwordHash.expected
    );
    const usernameMatches = safeStringEqual(
      credentials.username,
      this.options.username
    );

    if (!usernameMatches || !passwordMatches) {
      return null;
    }

    await this.repository.deleteExpired(now);

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(
      now.getTime() + this.options.sessionTtlSeconds * 1_000
    );
    const stored = await this.repository.create({
      tokenHash,
      username: this.options.username,
      expiresAt
    });

    return {
      ...stored,
      rawToken,
      csrfToken: this.createCsrfToken(rawToken)
    };
  }

  public async authenticate(
    rawToken: string,
    now = new Date()
  ): Promise<(StoredAdminSession & { csrfToken: string }) | null> {
    const session = await this.repository.findActive(
      hashSessionToken(rawToken),
      now
    );

    return session
      ? {
          ...session,
          csrfToken: this.createCsrfToken(rawToken)
        }
      : null;
  }

  public async logout(tokenHash: string, now = new Date()): Promise<void> {
    await this.repository.revoke(tokenHash, now);
  }

  public csrfTokenMatches(candidate: string, expected: string): boolean {
    return safeStringEqual(candidate, expected);
  }

  private createCsrfToken(rawToken: string): string {
    return createHmac("sha256", this.options.sessionSecret)
      .update(`admin-csrf\n${rawToken}`)
      .digest("base64url");
  }
}
