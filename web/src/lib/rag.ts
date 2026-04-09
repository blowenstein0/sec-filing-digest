import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Citation } from "@/types";

const region = process.env.APP_REGION || process.env.AWS_REGION || "us-east-1";
const kbClient = new BedrockAgentRuntimeClient({ region });
const s3Client = new S3Client({ region });

const KB_ID = process.env.KNOWLEDGE_BASE_ID || "";
const BUCKET = process.env.FILING_TEXT_BUCKET || "";

export interface RAGResult {
  passages: string[];
  fullText: string;
  sources: Citation[];
  chunkCount: number;
}

/**
 * Search the Knowledge Base for relevant filing chunks.
 * Returns top 8 passages matching the query, filtered by ticker and form type.
 */
export async function searchFilingChunks(
  ticker: string,
  query: string,
  formType: string = "10-K",
): Promise<RAGResult | null> {
  if (!KB_ID) return null;

  try {
    const response = await kbClient.send(
      new RetrieveCommand({
        knowledgeBaseId: KB_ID,
        retrievalQuery: { text: `${ticker} ${query}` },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 8,
            filter: {
              andAll: [
                { equals: { key: "ticker", value: { stringValue: ticker.toUpperCase() } } },
                { equals: { key: "form_type", value: { stringValue: formType } } },
              ],
            },
          },
        },
      })
    );

    const results = response.retrievalResults || [];
    if (results.length === 0) return null;

    const passages = results
      .filter((r) => r.content?.text)
      .map((r, i) => {
        const score = r.score?.toFixed(3) || "N/A";
        return `[Passage ${i + 1}] (relevance: ${score})\n${r.content!.text}`;
      });

    // Build source citation from the first result's location
    const sources: Citation[] = [];
    const firstLoc = results[0]?.location?.s3Location;
    if (firstLoc?.uri) {
      sources.push({
        type: "filing",
        label: `${formType} (semantic search, ${results.length} passages)`,
        url: firstLoc.uri,
      });
    }

    return {
      passages,
      fullText: passages.join("\n\n---\n\n"),
      sources,
      chunkCount: results.length,
    };
  } catch (err) {
    console.error("[RAG] Retrieve error:", err);
    return null;
  }
}

/**
 * Upload filing text to S3 for async indexing.
 * Fire-and-forget — the S3 event triggers a Lambda that calls StartIngestionJob.
 * The user does not wait for embedding.
 */
export async function uploadForIndexing(
  ticker: string,
  accessionNumber: string,
  formType: string,
  filingDate: string,
  companyName: string,
  cik: string,
  text: string,
): Promise<void> {
  if (!BUCKET) return;

  const key = `filings/${ticker.toUpperCase()}/${accessionNumber}.txt`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: text,
        ContentType: "text/plain",
        Metadata: {
          ticker: ticker.toUpperCase(),
          form_type: formType,
          filing_date: filingDate,
          company_name: companyName,
          cik,
        },
      })
    );
    console.log(`[RAG] Uploaded ${key} for indexing (${text.length} chars)`);
  } catch (err) {
    console.error("[RAG] S3 upload error:", err);
    // Non-critical — the user still gets the degraded answer
  }
}
