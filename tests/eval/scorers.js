/**
 * Custom promptfoo scorers for financial accuracy and quality.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-east-1" }),
  { marshallOptions: { removeUndefinedValues: true } }
);
const METRICS_TABLE = process.env.METRICS_TABLE || "sec-financial-metrics";

/**
 * Verify that dollar amounts in the answer match DynamoDB ground truth.
 * Returns a score of 0-1 based on accuracy.
 */
async function financialAccuracy(output, context) {
  const ticker = context.vars?.ticker;
  if (!ticker) return { pass: true, score: 1, reason: "No ticker specified, skipping accuracy check" };

  // Get ground truth from DynamoDB
  let groundTruth;
  try {
    const result = await client.send(
      new GetCommand({
        TableName: METRICS_TABLE,
        Key: { ticker: ticker.toUpperCase() },
      })
    );
    if (!result.Item) {
      return { pass: true, score: 0.5, reason: `No ground truth for ${ticker} in DynamoDB` };
    }
    groundTruth = result.Item.metrics;
  } catch (err) {
    return { pass: true, score: 0.5, reason: `DynamoDB error: ${err.message}` };
  }

  // Extract dollar amounts from the answer
  // Matches: $416.2B, $94.8B, $31.0M, $7.35, etc.
  const dollarPattern = /\$[\d,.]+(?:\s*[BMT](?:illion)?)?/gi;
  const answerAmounts = output.match(dollarPattern) || [];

  if (answerAmounts.length === 0) {
    return { pass: true, score: 0.5, reason: "No dollar amounts found in answer to verify" };
  }

  // Parse dollar string to number
  function parseDollar(str) {
    const clean = str.replace(/[$,]/g, "").trim();
    const multipliers = { T: 1e12, B: 1e9, M: 1e6 };
    for (const [suffix, mult] of Object.entries(multipliers)) {
      if (clean.toUpperCase().endsWith(suffix)) {
        return parseFloat(clean.slice(0, -1)) * mult;
      }
      if (clean.toLowerCase().endsWith(suffix.toLowerCase() + "illion")) {
        return parseFloat(clean.replace(/[a-z]/gi, "")) * mult;
      }
    }
    return parseFloat(clean);
  }

  // Build set of valid ground truth values
  const validValues = new Set();
  for (const [, metric] of Object.entries(groundTruth)) {
    for (const period of metric.periods || []) {
      validValues.add(Number(period.value));
    }
  }

  let verified = 0;
  let unverified = 0;
  const details = [];

  for (const amountStr of answerAmounts) {
    const amount = parseDollar(amountStr);
    if (isNaN(amount)) continue;

    // Check if this amount matches any ground truth value within 5% tolerance
    let matched = false;
    for (const truth of validValues) {
      const tolerance = Math.abs(truth) * 0.05;
      if (Math.abs(amount - truth) <= tolerance) {
        matched = true;
        verified++;
        break;
      }
    }

    if (!matched) {
      // Could be a derived value (margin %, growth %, etc.) — don't penalize small numbers
      if (amount < 1e6) {
        // Skip small numbers (EPS, percentages reported as dollars)
        continue;
      }
      unverified++;
      details.push(`${amountStr} not found in ground truth`);
    }
  }

  const total = verified + unverified;
  if (total === 0) {
    return { pass: true, score: 1, reason: "No verifiable amounts" };
  }

  const score = verified / total;
  const pass = score >= 0.7; // At least 70% of amounts must be verifiable

  return {
    pass,
    score,
    reason: `${verified}/${total} amounts verified against DynamoDB${details.length > 0 ? ". Unverified: " + details.join(", ") : ""}`,
  };
}

/**
 * Check that citations exist and are properly formatted.
 */
function citationQuality(output) {
  const citations = output.match(/\[\d+\]/g) || [];
  const uniqueCitations = new Set(citations.map((c) => c));

  if (uniqueCitations.size === 0) {
    return { pass: false, score: 0, reason: "No citations found" };
  }

  // Check that citations appear near numbers
  const sentences = output.split(/[.!?]\s+/);
  let sentencesWithNumbers = 0;
  let sentencesWithNumbersAndCitations = 0;

  for (const sentence of sentences) {
    if (/\$[\d,.]+/.test(sentence)) {
      sentencesWithNumbers++;
      if (/\[\d+\]/.test(sentence)) {
        sentencesWithNumbersAndCitations++;
      }
    }
  }

  let citationCoverage = 1;
  if (sentencesWithNumbers > 0) {
    citationCoverage = sentencesWithNumbersAndCitations / sentencesWithNumbers;
  }

  const pass = citationCoverage >= 0.6;

  return {
    pass,
    score: citationCoverage,
    reason: `${uniqueCitations.size} unique citations. ${sentencesWithNumbersAndCitations}/${sentencesWithNumbers} numeric sentences have citations.`,
  };
}

/**
 * Check answer conciseness.
 */
function conciseness(output, context) {
  const maxWords = context.vars?.maxWords || 500;
  const wordCount = output.split(/\s+/).length;
  const score = wordCount <= maxWords ? 1 : Math.max(0, 1 - (wordCount - maxWords) / maxWords);

  return {
    pass: wordCount <= maxWords * 1.5, // Fail if 50%+ over limit
    score,
    reason: `${wordCount} words (target: <${maxWords})`,
  };
}

/**
 * Check that the answer doesn't contain filler phrases.
 */
function noFiller(output) {
  const fillerPatterns = [
    /let me (?:analyze|look at|examine|break down|start)/i,
    /I(?:'d| would) (?:be happy|like) to/i,
    /great question/i,
    /let's dive (?:in|into)/i,
    /here's (?:a |an )?(?:comprehensive|detailed|thorough) (?:analysis|look|overview|breakdown)/i,
    /it's (?:important|worth) (?:to note|noting|mentioning)/i,
    /in (?:conclusion|summary),?\s/i,
    /please (?:note|keep in mind)/i,
    /I should (?:note|mention|point out)/i,
    /as (?:always|a reminder),?\s.*(?:verify|consult|professional)/i,
    /this is not (?:financial|investment) advice/i,
  ];

  const matches = [];
  for (const pattern of fillerPatterns) {
    const match = output.match(pattern);
    if (match) matches.push(match[0]);
  }

  const pass = matches.length === 0;
  const score = Math.max(0, 1 - matches.length * 0.25);

  return {
    pass,
    score,
    reason: matches.length === 0
      ? "No filler detected"
      : `Filler found: ${matches.map((m) => `"${m}"`).join(", ")}`,
  };
}

/**
 * Check that comparison answers include all requested companies.
 */
function comparisonCompleteness(output, context) {
  const tickers = context.vars?.tickers;
  if (!tickers || !Array.isArray(tickers)) {
    return { pass: true, score: 1, reason: "Not a comparison test" };
  }

  const missing = tickers.filter((t) => !output.toUpperCase().includes(t.toUpperCase()));
  const score = (tickers.length - missing.length) / tickers.length;

  return {
    pass: missing.length === 0,
    score,
    reason: missing.length === 0
      ? `All ${tickers.length} companies mentioned`
      : `Missing: ${missing.join(", ")}`,
  };
}

module.exports = {
  financialAccuracy,
  citationQuality,
  conciseness,
  noFiller,
  comparisonCompleteness,
};
