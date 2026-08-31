import assert from "node:assert/strict"
const identifier = name => {
  assert.match(name, /^[a-z_]+$/)
  return `"${name}"`
}

// Exercise the actual API handler and actual PostgreSQL functions locally.
// Only the PostgREST transport and signed-session boundary are substituted.
export function localClient(db) {
  const writes = []
  const client = {
    writes,
    async rpc(name, args) {
      writes.push(name)
      try {
        const entries = Object.entries(args)
        const values = entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value)
        const result = await db.query(`select ${identifier(name)}(${entries.map(([key], index) => `${identifier(key)} => $${index + 1}`).join(",")}) as value`, values)
        return { data: result.rows[0].value, error: null }
      } catch (error) { return { data: null, error } }
    },
    from(table) {
      let fields = "*", operation = "select", payload, single = false, page
      const filters = [], orders = []
      const query = {
        select(value) { fields = value; return query },
        eq(key, value) { filters.push([key, [value]]); return query },
        in(key, values) { filters.push([key, values]); return query },
        order(key, options = {}) { orders.push(`${identifier(key)} ${options.ascending === false ? "desc" : "asc"}`); return query },
        range(from, to) { page = { from, to }; return query },
        update(value) { operation = "update"; payload = value; return query },
        insert(value) { operation = "insert"; payload = value; return query },
        delete() { operation = "delete"; return query },
        maybeSingle() { single = true; return query },
        single() { single = true; return query },
        async then(resolve) {
          try {
            const values = []
            const param = value => { values.push(value); return `$${values.length}` }
            const selected = fields === "*" ? "*" : fields.split(",").map(identifier).join(",")
            let sql
            if (operation === "select") sql = `select ${selected} from ${identifier(table)}`
            if (operation === "update") sql = `update ${identifier(table)} set ${Object.entries(payload).map(([key, value]) => `${identifier(key)}=${param(value)}`).join(",")}`
            if (operation === "delete") sql = `delete from ${identifier(table)}`
            if (operation === "insert") {
              const rows = Array.isArray(payload) ? payload : [payload]
              const keys = Object.keys(rows[0])
              sql = `insert into ${identifier(table)} (${keys.map(identifier)}) values ${rows.map(row => `(${keys.map(key => param(row[key])).join(",")})`).join(",")}`
            }
            if (filters.length) sql += " where " + filters.map(([key, items]) => `${identifier(key)} in (${items.map(param).join(",")})`).join(" and ")
            if (operation === "select" && orders.length) sql += " order by " + orders.join(",")
            if (operation === "select" && page) sql += ` limit ${param(page.to - page.from + 1)} offset ${param(page.from)}`
            if (operation !== "select") { writes.push(`${operation}:${table}`); sql += ` returning ${selected}` }
            // JSON preserves PostgreSQL timestamp precision for optimistic checks.
            const result = await db.query(operation === "select"
              ? `select to_jsonb(result) as value from (${sql}) result`
              : `with result as (${sql}) select to_jsonb(result) as value from result`, values)
            const rows = result.rows.map(row => row.value)
            return resolve({ data: single ? rows[0] || null : rows, error: null })
          } catch (error) { return resolve({ data: null, error }) }
        },
      }
      return query
    },
  }
  return client
}
