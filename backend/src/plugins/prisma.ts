import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { prisma } from "@/db/client.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

export default fp(function prismaPlugin(app: FastifyInstance) {
  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});
