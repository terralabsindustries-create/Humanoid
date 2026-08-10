import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { ApiError } from "@/lib/errors/api-error.js";

/**
 * Every response that isn't a 2xx goes through here, so every error the API
 * ever returns has the same shape from `api.md` — a client only needs to
 * write one error-handling path, not one per route.
 */
export default fp(function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | ApiError | ZodError, request, reply) => {
    const requestId = request.id;

    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        },
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request could not be processed.",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
          request_id: requestId,
        },
      });
      return;
    }

    // Fastify's own schema validation (route-level `schema.body`, etc.).
    if (error.validation) {
      reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request could not be processed.",
          details: error.validation,
          request_id: requestId,
        },
      });
      return;
    }

    if (error.statusCode === 429) {
      reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again shortly.",
          details: [],
          request_id: requestId,
        },
      });
      return;
    }

    // Anything unclassified is logged in full server-side and given a generic
    // message client-side — a stack trace is never sent over the wire.
    request.log.error({ err: error }, "Unhandled error");
    reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong on our end.",
        details: [],
        request_id: requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "This route does not exist.",
        details: [],
        request_id: request.id,
      },
    });
  });
});
