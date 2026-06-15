CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "embedding" vector(384);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lessons_embedding_hnsw_idx" ON "lessons" USING hnsw ("embedding" vector_cosine_ops);
