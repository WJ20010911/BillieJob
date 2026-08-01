import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const { createBackup } = await import("../src/lib/backup");
  const backup = await createBackup();
  console.log(`Created ${backup.archiveName} (${backup.archiveBytes} bytes)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
