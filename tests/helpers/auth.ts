import type { FastifyInstance } from "fastify";

export const DEMO_ADMIN_USERNAME = "admin";
export const DEMO_ADMIN_PASSWORD = "demo-admin-password";

export async function loginAsDemoAdmin(
  app: FastifyInstance
): Promise<{ cookie: string; csrfToken: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      username: DEMO_ADMIN_USERNAME,
      password: DEMO_ADMIN_PASSWORD
    }
  });

  if (response.statusCode !== 200) {
    throw new Error(`Demo admin login failed: ${response.body}`);
  }

  const setCookie = response.headers["set-cookie"];
  const serializedCookie = Array.isArray(setCookie)
    ? setCookie[0]
    : setCookie;

  if (!serializedCookie) {
    throw new Error("Demo admin login did not set a session cookie");
  }

  return {
    cookie: serializedCookie.split(";", 1)[0]!,
    csrfToken: response.json().csrfToken
  };
}
