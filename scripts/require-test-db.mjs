const value = process.env.DATABASE_URL_TEST;

if (!value) {
  console.error("DATABASE_URL_TEST is required for end-to-end integration tests.");
  console.error("Point it to a dedicated disposable PostgreSQL database whose name includes 'test'.");
  process.exit(1);
}

let databaseName;
try {
  databaseName = new URL(value).pathname.replace(/^\//, "");
} catch {
  console.error("DATABASE_URL_TEST must be a valid PostgreSQL connection URL.");
  process.exit(1);
}

if (!/test/i.test(databaseName)) {
  console.error(`Refusing to run destructive integration tests against database '${databaseName}'.`);
  console.error("Use a dedicated database with 'test' in its name, e.g. personal_schedule_test.");
  process.exit(1);
}
