import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import dotenv from "dotenv";

dotenv.config();

const region = process.env.AWS_REGION || "us-east-1";
const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || "voclara-audio-qc";

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn("⚠️ AWS Credentials are completely missing from backend .env!");
}

const lambdaClientOpts = {
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
};

export const lambdaClient = new LambdaClient(lambdaClientOpts);

/**
 * Invokes the AWS Lambda Audio QC function.
 * @param {Object} params
 * @param {string} params.bucket - S3 bucket name where audio file is stored
 * @param {string} params.key - S3 key to the audio file
 * @param {string} [params.output_prefix] - E.g. "qc_plots/"
 * @param {boolean} [params.skip_yamnet] - Whether to skip YAMNet noise evaluation
 * @param {boolean} [params.return_base64_plot] - Whether to return base64 spectrogram plot
 * @returns {Promise<Object>} The unified QC result payload
 */
export async function invokeAudioQC({
  bucket,
  key,
  output_prefix = "qc_plots/",
  skip_yamnet = false,
  return_base64_plot = false,
}) {
  const payload = {
    bucket,
    key,
    output_prefix,
    skip_yamnet,
    return_base64_plot,
  };

  const command = new InvokeCommand({
    FunctionName: functionName,
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  console.log(`[Lambda QC] Invoking ${functionName} for s3://${bucket}/${key}...`);
  const response = await lambdaClient.send(command);

  if (response.FunctionError) {
    const errorPayload = JSON.parse(Buffer.from(response.Payload).toString());
    throw new Error(`Lambda FunctionError: ${errorPayload.errorMessage || "Unknown error"}`);
  }

  const result = JSON.parse(Buffer.from(response.Payload).toString());
  if (result.statusCode !== 200) {
    const body = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
    throw new Error(`Lambda returned status ${result.statusCode}: ${body?.error || "Unknown error"}`);
  }

  // Lambda returns response.body (either stringified or object)
  const body = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
  return body;
}
