// Thin better-sqlite3-compatible wrapper around a sql.js Database, so the
// shared schema/queries/logic run unchanged in the browser.
// Supports the subset the shared code uses: prepare().get/all/run(),
// exec(), transaction(), pragma().

function bindArgs(params) {
  // better-sqlite3 style positional args -> sql.js bind array
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export function wrapSqlJs(raw, onWrite = () => {}) {
  let txDepth = 0;
  const notify = () => { if (txDepth === 0) onWrite(); };

  return {
    prepare(sql) {
      return {
        get(...params) {
          const stmt = raw.prepare(sql);
          try {
            stmt.bind(bindArgs(params));
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally { stmt.free(); }
        },
        all(...params) {
          const stmt = raw.prepare(sql);
          try {
            stmt.bind(bindArgs(params));
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally { stmt.free(); }
        },
        run(...params) {
          const stmt = raw.prepare(sql);
          try {
            stmt.bind(bindArgs(params));
            stmt.step();
          } finally { stmt.free(); }
          const changes = raw.getRowsModified();
          notify();
          return { changes };
        },
      };
    },
    exec(sql) {
      raw.exec(sql);
      notify();
    },
    transaction(fn) {
      return (...args) => {
        if (txDepth > 0) return fn(...args); // nested: join the outer transaction
        raw.exec('BEGIN');
        txDepth++;
        try {
          const result = fn(...args);
          raw.exec('COMMIT');
          txDepth--;
          notify();
          return result;
        } catch (err) {
          txDepth--;
          try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
          throw err;
        }
      };
    },
    pragma(str) {
      const stmt = raw.prepare(`PRAGMA ${str}`);
      const rows = [];
      try { while (stmt.step()) rows.push(stmt.getAsObject()); } finally { stmt.free(); }
      return rows;
    },
    export() {
      return raw.export();
    },
  };
}
