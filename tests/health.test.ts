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