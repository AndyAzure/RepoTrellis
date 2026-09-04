import type Database from "better-sqlite3";

import type { Interest, InterestInput } from "./interest";

interface InterestRow {
  id: number;
  name: string;
  description: string | null;
  positiveRules: string;
  negativeRules: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export function getActiveInterest(sqlite: Database.Database): Interest | null {
  const row = sqlite
    .prepare<[], InterestRow>(
      `select id, name, description,
              positive_rules as positiveRules,
              negative_rules as negativeRules,
              is_active as isActive,
              created_at as createdAt,
              updated_at as updatedAt
       from interests
       order by is_active desc, updated_at desc, id desc
       limit 1`,
    )
    .get();

  return row ? mapInterestRow(row) : null;
}

export function saveActiveInterest(
  sqlite: Database.Database,
  input: InterestInput,
): Interest {
  const normalized = normalizeInterestInput(input);
  const save = sqlite.transaction(() => {
    const current = sqlite
      .prepare<[], { id: number }>(
        `select id from interests
         order by is_active desc, updated_at desc, id desc limit 1`,
      )
      .get();

    let id: number;
    if (current) {
      sqlite
        .prepare(
          `update interests
           set name = ?, description = ?, positive_rules = ?, negative_rules = ?,
               is_active = 1, updated_at = CURRENT_TIMESTAMP
           where id = ?`,
        )
        .run(
          normalized.name,
          normalized.description,
          JSON.stringify(normalized.positiveRules),
          JSON.stringify(normalized.negativeRules),
          current.id,
        );
      id = current.id;
    } else {
      const result = sqlite
        .prepare(
          `insert into interests (
             name, description, positive_rules, negative_rules, is_active
           ) values (?, ?, ?, ?, 1)`,
        )
        .run(
          normalized.name,
          normalized.description,
          JSON.stringify(normalized.positiveRules),
          JSON.stringify(normalized.negativeRules),
        );
      id = Number(result.lastInsertRowid);
    }

    sqlite
      .prepare(
        `update interests set is_active = case when id = ? then 1 else 0 end
         where id <> ? and is_active = 1`,
      )
      .run(id, id);

    const saved = sqlite
      .prepare<[number], InterestRow>(
        `select id, name, description,
                positive_rules as positiveRules,
                negative_rules as negativeRules,
                is_active as isActive,
                created_at as createdAt,
                updated_at as updatedAt
         from interests where id = ?`,
      )
      .get(id);
    if (!saved) throw new Error("Failed to save the interest profile.");
    return mapInterestRow(saved);
  });

  return save.immediate();
}

export function normalizeInterestInput(input: InterestInput): InterestInput {
  return {
    name: input.name.trim().slice(0, 100),
    description: input.description?.trim().slice(0, 1_000) || null,
    positiveRules: normalizeRules(input.positiveRules),
    negativeRules: normalizeRules(input.negativeRules),
  };
}

function normalizeRules(rules: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of rules) {
    const rule = value.trim().slice(0, 80);
    const key = rule.toLocaleLowerCase();
    if (!rule || seen.has(key)) continue;
    seen.add(key);
    normalized.push(rule);
    if (normalized.length >= 20) break;
  }
  return normalized;
}

function mapInterestRow(row: InterestRow): Interest {
  return {
    ...row,
    positiveRules: parseRules(row.positiveRules),
    negativeRules: parseRules(row.negativeRules),
    isActive: row.isActive === 1,
  };
}

function parseRules(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((rule): rule is string => typeof rule === "string")
      : [];
  } catch {
    return [];
  }
}
