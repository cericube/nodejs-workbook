-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "withdrawn_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("created_at", "display_name", "email", "id", "password_hash", "status", "updated_at", "withdrawn_at") SELECT "created_at", "display_name", "email", "id", "password_hash", "status", "updated_at", "withdrawn_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_role_idx" ON "users"("role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
