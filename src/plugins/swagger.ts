import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyPlugin from "fastify-plugin";

import { adminSessionCookieName } from "../modules/auth/auth.hooks.js";

// Swagger is registered before feature routes so their schemas enter the document.
export const swaggerPlugin = fastifyPlugin(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: "3.0.3",
        info: {
          title: "Customer Inquiry Automation API",
          description:
            "Public inquiry intake and authenticated admin APIs.",
          version: "1.0.0"
        },
        components: {
          securitySchemes: {
            AdminSession: {
              type: "apiKey",
              in: "cookie",
              name: adminSessionCookieName()
            },
            CsrfToken: {
              type: "apiKey",
              in: "header",
              name: "x-csrf-token"
            }
          }
        }
      }
    });

    await app.register(swaggerUi, {
      routePrefix: "/documentation",
      uiConfig: {
        docExpansion: "list",
        deepLinking: false
      },
      staticCSP: true
    });
  },
  { name: "swagger" }
);
