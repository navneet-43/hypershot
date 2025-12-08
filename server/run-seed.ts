import 'dotenv/config';
import { seedDefaultAdmin } from "./seed";

// This file is only called during build: npx tsx server/run-seed.ts
// It's NOT bundled into the main server

seedDefaultAdmin()
  .then(() => {
    console.log("✅ Seeding completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  });

