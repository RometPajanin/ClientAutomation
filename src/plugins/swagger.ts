import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyPlugin from "fastify-plugin";

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
            AdminApiKey: {
              type: "apiKey",
              in: "header",
              name: "x-admin-api-key"
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
