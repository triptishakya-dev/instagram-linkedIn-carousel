import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: process.env.DATABASE_URL || env("DATABASE_URL"),
    /**
     * `migrate dev` and `migrate diff --from-migrations` need a throwaway
     * database to replay the migration history into. Without it Prisma has no
     * way to compare the folder against the schema.
     */
    shadowDatabaseUrl: process.env.DATABASE_URL_SHADOW || env("DATABASE_URL_SHADOW"),
  },
});