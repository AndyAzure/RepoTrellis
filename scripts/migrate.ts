import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db, sqlite } from "../src/db";

try {
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied.");
} finally {
  sqlite.close();
}
