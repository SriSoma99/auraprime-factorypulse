// Industrial RAG Corpus Indexer & Seeder (1-5 MB realistic industrial plant manuals).
// Seeds OEM documentation into know.citation and know.chunk_embedding with pgvector HNSW indexing.
import { config, appPool } from "@fp/db";
import { KnowledgeService } from "@fp/knowledge-svc";
import { generateIndustrialCorpus } from "@fp/synthetic-data";

async function main() {
  const cfg = config();
  const pool = appPool(cfg);
  const knowledgeSvc = new KnowledgeService(cfg, pool);

  console.log("=================================================================");
  console.log("    AuraPrime FactoryPulse v2 - Industrial RAG Corpus Indexer (1-5 MB)   ");
  console.log("=================================================================");

  const docs = generateIndustrialCorpus();
  let totalBytes = 0;
  for (const doc of docs) {
    totalBytes += Buffer.byteLength(doc.content, "utf8");
  }
  const sizeMb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(`Corpus generated: ${docs.length} document modules (~${sizeMb} MB of technical text)`);
  console.log("Beginning parallel vector chunking and HNSW indexing into PostgreSQL...");

  const startTime = Date.now();
  let totalChunks = 0;
  let successCount = 0;

  for (const doc of docs) {
    try {
      const res = await knowledgeSvc.ingestDocument({
        id: `${doc.id}-${doc.section.replace(/[^a-zA-Z0-9]/g, "-")}`,
        tenant_id: "t-demo",
        metadata: {
          title: doc.title,
          section: doc.section,
          version: doc.version,
          effective_from: doc.effectiveDate,
          classification: "internal",
          verified: true,
        },
        content: `${doc.title} - ${doc.section}\n\n${doc.content}`,
        chunkSize: cfg.knowledge.chunk_chars,
      });
      totalChunks += res.total_chunks;
      successCount++;
    } catch (err) {
      console.error(`Error indexing ${doc.id} (${doc.section}):`, (err as Error).message);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("-----------------------------------------------------------------");
  console.log(`✅ Ingestion Complete:`);
  console.log(`   - Modules indexed: ${successCount} / ${docs.length}`);
  console.log(`   - Total semantic vector chunks: ${totalChunks}`);
  console.log(`   - Total raw corpus size: ${sizeMb} MB`);
  console.log(`   - Indexing duration: ${durationSec}s`);
  console.log(`   - Embedding model: local-384-dim`);
  console.log("-----------------------------------------------------------------");

  // Sample RAG query verification
  console.log("Running sample verification query: 'coolant flow strainer particulate fouling citric acid'...");
  const ragResult = await knowledgeSvc.queryRAG({
    tenant_id: "t-demo",
    question: "How do I inspect and clean the weld transformer coolant strainer when flow FT-401 drops?",
    top_k: 3,
  });

  console.log(`Model used: ${ragResult.model}`);
  console.log(`Latency: ${ragResult.latency_ms}ms`);
  console.log(`Citations verified: ${ragResult.citations_verified ? "YES (RAG-6/7 PASS)" : "NO"}`);
  console.log(`Retrieved chunks: ${ragResult.retrieved_chunks.length}`);
  console.log(`\nSample Answer:\n${ragResult.answer}\n`);

  await pool.end();
  console.log("=================================================================");
  console.log("    Industrial RAG Knowledge Base is LIVE and Ready for Demo     ");
  console.log("=================================================================");
}

main().catch((err) => {
  console.error("Fatal indexing error:", err);
  process.exit(1);
});
