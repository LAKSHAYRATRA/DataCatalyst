import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

// Ensure fundamental environment definitions exist (Throw loud logs for immediate dev visibility!)
const region = process.env.AWS_REGION || "us-east-1";
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn("⚠️ AWS Credentials are completely missing from backend .env!");
}
if (!process.env.S3_BUCKET_NAME) {
  console.warn("⚠️ S3_BUCKET_NAME is utterly missing from backend .env!");
}

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME || "";
