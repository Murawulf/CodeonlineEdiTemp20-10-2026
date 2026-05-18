const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("allgpc.db");

// List your SQL files here
const sqlFiles = ["segmentgpc.sql", "famillegpc.sql", "classegpc.sql", "brickgpc.sql"];

function cleanSqlForSQLite(rawSql) {
  return rawSql
    .replace(/--.*\n/g, "")                                // Remove -- comments
    .replace(/\/\*[\s\S]*?\*\//g, "")                      // Remove /* */ comments
    .replace(/SET\s+[^;]+;/gi, "")                         // Remove SET statements
    .replace(/ENGINE=\w+/gi, "")                           // Remove ENGINE=
    .replace(/AUTO_INCREMENT=\d*/gi, "")                   // Remove AUTO_INCREMENT=
    .replace(/CHARACTER SET \w+/gi, "")                    // Remove CHARACTER SET
    .replace(/COLLATE \w+/gi, "")                          // Remove COLLATE
    .replace(/DEFAULT CHARSET=\w+/gi, "")                  // Remove DEFAULT CHARSET
    .replace(/`/g, "")                                     // Remove backticks
    .replace(/,\s*PRIMARY KEY/gi, "\nPRIMARY KEY")         // Fix misplaced comma before PRIMARY KEY
    .replace(/\),\s*PRIMARY KEY/gi, "\nPRIMARY KEY")       // Another variant fix
    .replace(/UNSIGNED/gi, "")                             // Remove MySQL-specific types
    .replace(/int\(\d+\)/gi, "INTEGER")                    // Convert int(11) to INTEGER
    .replace(/varchar\(\d+\)/gi, "TEXT")                   // Convert varchar(n) to TEXT
    .replace(/double/gi, "REAL")                           // Convert double to REAL
    .replace(/datetime/gi, "TEXT")                         // Convert datetime to TEXT
    .replace(/(?<=\bNOT NULL)\s+DEFAULT\s+'?[^,\n]+'?/gi, "") // Remove default values from NOT NULL fields
    .replace(/,\s*\)/g, "\n)");                            // Fix trailing commas
}

function importSqlFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const cleaned = cleanSqlForSQLite(raw);

  db.exec(cleaned, (err) => {
    if (err) {
      console.error(`❌ Error in ${file}:`, err.message);
    } else {
      console.log(`✅ Imported ${file}`);
    }
  });
}

db.serialize(() => {
  sqlFiles.forEach(importSqlFile);
});

db.close(() => {
  console.log("✅ allgpc.db created and closed.");
});
