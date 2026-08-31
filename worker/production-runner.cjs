// PM2 wrapper for Windows — tsx.CMD is not compatible with PM2's interpreter mode
// This file is imported by PM2 via the ecosystem config.
// It does the same thing as: tsx --env-file=.env worker/dm-worker.ts

// Load environment from .env
const { config } = require("dotenv");
const path = require("path");
config({ path: path.resolve(__dirname, "..", ".env") });

// Register tsx to handle TypeScript imports (using CJS-compatible entry point)
require("tsx/cjs");
require("./dm-worker.ts");