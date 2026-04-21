import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error("Enterprise Redis Integration Requires REDIS_URL in .env");
}

// Upstash utilizes standard TLS/SSL natively through the rediss:// protocol format.
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for certain background queuing integrations natively
  retryStrategy(times) {
    console.warn(`Retrying Redis connection: attempt ${times}`);
    return Math.min(times * 100, 3000); 
  }
});

// Duplicating connections effectively separating standard DB Queries from WebSockets streaming natively!
export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();

redis.on("error", (err) => console.error("[Redis] Database Connection Error:", err));
pubClient.on("error", (err) => console.error("[Redis Pub] Publisher Error:", err));
subClient.on("error", (err) => console.error("[Redis Sub] Subscriber Error:", err));
