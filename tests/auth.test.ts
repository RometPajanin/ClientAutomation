import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import {
  adminSessionCookieName,
  adminSessionCookieOptions
} from "../src/modules/auth/auth.hooks.js";
import {
  DEMO_ADMIN_PASSWORD,
  DEMO_ADMIN_USERNAME,
  loginAsDemoAdmin
} from "./helpers/auth.js";

describe("administrator cookie sessions", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false, analysisProvider: null });
    await app.ready();
  });

  afterAll(async () => {
    await app.prisma.adminSession.deleteMany({
      where: { username: DEMO_ADMIN_USERNAME }
    });
    await app.close();
  });

  it("returns one generic error for invalid credentials", async () => {
    const wrongUsername = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "not-admin",
        password: DEMO_ADMIN_PASSWORD
      }
    });
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: DEMO_ADMIN_USERNAME,
        password: "wrong-password"
      }
    });

    expect(wrongUsername.statusCode).toBe(401);
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongUsername.json()).toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "The username or password is incorrect"
      }
    });
    expect(wrongPassword.json().error).toEqual(
      wrongUsername.json().error
    );
  });

  it("uses a Secure __Host cookie in production", () => {
    expect(adminSessionCookieName("production")).toBe(
      "__Host-ca_session"
    );
    expect(adminSessionCookieOptions("production")).toMatchObject({
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      signed: true
    });
  });

  it("creates and restores an opaque HttpOnly session", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: DEMO_ADMIN_USERNAME,
        password: DEMO_ADMIN_PASSWORD
      }
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers["cache-control"]).toBe("no-store");
    expect(login.json()).toMatchObject({
      user: { username: DEMO_ADMIN_USERNAME },
      csrfToken: expect.any(String),
      expiresAt: expect.any(String)
    });

    const setCookie = String(login.headers["set-cookie"]);
    expect(setCookie).toContain("ca_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain(DEMO_ADMIN_USERNAME);

    const cookie = setCookie.split(";", 1)[0]!;
    const restored = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie }
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toEqual(login.json());

    const stored = await app.prisma.adminSession.findFirstOrThrow({
      where: { username: DEMO_ADMIN_USERNAME },
      orderBy: { createdAt: "desc" }
    });
    expect(setCookie).not.toContain(stored.tokenHash);
  });

  it("requires CSRF protection and revokes the session on logout", async () => {
    const session = await loginAsDemoAdmin(app);
    const missingCsrf = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: session.cookie }
    });

    expect(missingCsrf.statusCode).toBe(403);
    expect(missingCsrf.json()).toMatchObject({
      error: { code: "CSRF_TOKEN_INVALID" }
    });

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: session.cookie,
        "x-csrf-token": session.csrfToken
      }
    });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers["set-cookie"])).toContain(
      "Max-Age=0"
    );

    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: session.cookie }
    });
    expect(afterLogout.statusCode).toBe(401);
  });
});
