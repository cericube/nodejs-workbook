-- CreateTable
CREATE TABLE "post_attachments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "post_id" INTEGER NOT NULL,
    CONSTRAINT "post_attachments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "post_attachments_storage_key_key" ON "post_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "post_attachments_post_id_idx" ON "post_attachments"("post_id");
