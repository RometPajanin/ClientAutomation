import type { FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import { buildApp } from "../src/app.js";

describe("health endpoints", () => {
  let app: FastifyInstance;

  // One application instance is shared because these tests only read health state.
  beforeAll(async () => {
    app = buildApp({
      logger: false
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports that the process is alive", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/live"
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toMatchObject({
      status: "ok"
    });
    expect(response.headers["x-content-type-options"]).toBe(
      "nosniff"
    );
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
    expect(response.headers["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'"
    );
  });

  it("allows only the configured credentialed CORS origin", async () => {
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/admin/inquiries",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-csrf-token"
      }
    });
    const denied = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { origin: "https://attacker.example" }
    });

    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe(
      "true"
    );
    expect(denied.headers).not.toHaveProperty(
      "access-control-allow-origin"
    );
  });

  it("reports that the database is ready", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/ready"
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toMatchObject({
      status: "ok",
      database: "connected"
    });
  });

  it("returns a consistent 404 response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/does-not-exist"
    });

    expect(response.statusCode).toBe(404);

    expect(response.json()).toMatchObject({
      error: {
        code: "NOT_FOUND"
      }
    });
  });
});
