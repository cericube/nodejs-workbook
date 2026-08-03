/*
  Warnings:

  - A unique constraint covering the columns `[created_at,id]` on the table `posts` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "posts_created_at_id_key" ON "posts"("created_at", "id");
