import { defineConfig } from "drizzle-kit";


export default defineConfig({
    dialect: "sqlite",
    schema: "./app/db/schema.ts",
    out: "./drizzle",
    driver: 'd1-http', // Specify the D1 HTTP driver
    dbCredentials: {
        accountId: process.env.CLOUDFLARE1_ACCOUNT_ID!,
        databaseId: process.env.CLOUDFLARE1_D1_DATABASE_ID!,
        token: process.env.CLOUDFLARE1_API_TOKEN!,
    },
});