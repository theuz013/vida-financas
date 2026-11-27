import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export type DB = ReturnType<typeof getDb>;

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export const id = () => crypto.randomUUID();

export { schema };
