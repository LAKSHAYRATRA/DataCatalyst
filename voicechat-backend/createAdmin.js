import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb } from "./src/db.js";
import { User } from "./src/models/User.js";
const MONGODB_URI = process.env.MONGODB_URI || "";


async function createAdminUser() {
    try {
        await connectDb(MONGODB_URI);
        console.log("Connected to database");

        // Admin credentials
        const adminEmail = "admin@voclara.com";
        const adminPassword = "admin123"; // Change this to a secure password
        const firstname = "Admin";
        const lastname = "User";
        const username = "admin 1";

        // Check if admin already exists
        const existing = await User.findOne({ email: adminEmail });
        if (existing) {
            console.log("Admin user already exists!");

            // Update to make sure isAdmin is true
            if (!existing.isAdmin) {
                existing.isAdmin = true;
                await existing.save();
                console.log("Updated existing user to admin");
            }

            console.log("\nAdmin Credentials:");
            console.log("Email:", adminEmail);
            console.log("Password: (use your existing password or reset it)");
            process.exit(0);
        }

        // Create new admin user
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        const admin = await User.create({
            firstname,
            lastname,
            username,
            email: adminEmail,
            passwordHash,
            isAdmin: true,
        });

        console.log("\n✅ Admin user created successfully!");
        console.log("\nAdmin Credentials:");
        console.log("Email:", adminEmail);
        console.log("Password:", adminPassword);
        console.log("\n⚠️  IMPORTANT: Change the password after first login!");

        process.exit(0);
    } catch (error) {
        console.error("Error creating admin user:", error);
        process.exit(1);
    }
}

createAdminUser();
