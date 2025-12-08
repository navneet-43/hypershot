import 'dotenv/config';
import { db } from "./db";
import { platformUsers } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

export async function seedDefaultAdmin() {
  const targetEmail = "navneet@ruskmedia.com";
  const targetPassword = "123456";
  const targetUsername = "admin";
  
  try {
    console.log("\n🌱 STARTING ADMIN SEED PROCESS...");
    console.log(`   Target Email: ${targetEmail}`);
    console.log(`   Target Username: ${targetUsername}`);
    
    // Check if admin user already exists
    const existingAdmin = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.username, targetUsername))
      .limit(1);

    console.log(`   Existing admin found: ${existingAdmin.length > 0 ? 'YES' : 'NO'}`);

    // Hash the default password
    const hashedPassword = await bcrypt.hash(targetPassword, 10);

    if (existingAdmin.length === 0) {
      // Create default admin user
      const result = await db.insert(platformUsers).values({
        username: targetUsername,
        password: hashedPassword,
        email: targetEmail,
        fullName: "Admin User",
        role: "admin",
        isActive: true,
      }).returning();

      console.log("\n✅ DEFAULT ADMIN USER CREATED");
      console.log(`   Username: ${targetUsername}`);
      console.log(`   Email: ${targetEmail}`);
      console.log(`   Password: ${targetPassword}`);
      console.log(`   User ID: ${result[0]?.id}\n`);
    } else {
      // Update existing admin to ensure consistent credentials across all environments
      const result = await db
        .update(platformUsers)
        .set({
          password: hashedPassword,
          email: targetEmail,
          fullName: "Admin User",
          role: "admin",
          isActive: true,
        })
        .where(eq(platformUsers.username, targetUsername))
        .returning();

      console.log("\n✅ DEFAULT ADMIN CREDENTIALS SYNCED");
      console.log(`   Username: ${targetUsername}`);
      console.log(`   Email: ${targetEmail}`);
      console.log(`   Password: ${targetPassword}`);
      console.log(`   User ID: ${result[0]?.id}\n`);
    }
    
    return { success: true, username: targetUsername, email: targetEmail };
  } catch (error) {
    console.error("\n❌ ERROR SEEDING DEFAULT ADMIN:");
    console.error("   Error:", error);
    console.error("   Stack:", error instanceof Error ? error.stack : 'No stack trace');
    console.error("");
    throw error; // Re-throw to surface the error
  }
}

// Run the seed when this file is executed directly
seedDefaultAdmin()
  .then(() => {
    console.log("✅ Seeding completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  });
