import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EPOCH_DATE = "2026-04-18"; // BioConnections launch date (Eastern)

function getTodayEasternString(): string {
  const now = new Date();
  // Get date in America/New_York timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // "YYYY-MM-DD"
}

function getDaySeed(): number {
  const todayStr = getTodayEasternString();
  const today = new Date(todayStr + "T00:00:00");
  const epoch = new Date(EPOCH_DATE + "T00:00:00");
  return Math.floor((today.getTime() - epoch.getTime()) / 86_400_000);
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isLocalhost =
    origin !== null &&
    (origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1"));
  const allowedOrigin = isLocalhost ? origin : "https://gcbiology.org";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface PuzzleGroup {
  category: string;
  difficulty: "yellow" | "green" | "blue" | "purple";
  terms: string[];
}

interface Puzzle {
  groups: PuzzleGroup[];
}

function validatePuzzle(puzzle: unknown): puzzle is Puzzle {
  if (!puzzle || typeof puzzle !== "object") return false;
  const p = puzzle as Record<string, unknown>;
  if (!Array.isArray(p.groups) || p.groups.length !== 4) return false;

  const allTerms: string[] = [];
  const validDifficulties = new Set(["yellow", "green", "blue", "purple"]);

  for (const group of p.groups) {
    if (!group || typeof group !== "object") return false;
    const g = group as Record<string, unknown>;
    if (typeof g.category !== "string" || g.category.trim() === "") return false;
    if (!validDifficulties.has(g.difficulty as string)) return false;
    if (!Array.isArray(g.terms) || g.terms.length !== 4) return false;
    for (const term of g.terms) {
      if (typeof term !== "string" || term.trim() === "") return false;
      allTerms.push(term.toUpperCase());
    }
  }

  return new Set(allTerms).size === 16;
}

async function fetchPuzzleFromFireworks(seed: number, supabase: ReturnType<typeof createClient>): Promise<Puzzle> {
  const apiKey = Deno.env.get("FIREWORKS_API_KEY");
  if (!apiKey) throw new Error("FIREWORKS_API_KEY is not set");

  const model =
    Deno.env.get("FIREWORKS_MODEL") ??
    "accounts/fireworks/models/llama-v3p1-70b-instruct";

  // Try to load prompt from database
  let promptTemplate: string | null = null;
  const { data: configRow } = await supabase
    .from("game_config")
    .select("value")
    .eq("key", "system_prompt")
    .single();

  if (configRow?.value) {
    promptTemplate = configRow.value;
  }

  if (!promptTemplate) {
    promptTemplate = `You are a biology puzzle generator for an educational game called BioConnections. Given a seed number, generate a puzzle with exactly 4 groups of 4 biology terms each (16 terms total).

Rules:
- Each term must be a single word or very short phrase (max 2 words), all uppercase
- Terms should be college intro biology level
- Groups should be color-coded by difficulty:
  - YELLOW (easiest): obvious grouping, terms clearly belong together
  - GREEN (medium-easy): requires some bio knowledge
  - BLUE (medium-hard): requires solid bio knowledge, some terms could seem to fit other groups
  - PURPLE (hardest): tricky, terms are deliberately misleading and could appear to fit other groups
- The puzzle should have red herrings: terms in one group that LOOK like they belong in another group. This is what makes the game fun and challenging.
- All 16 terms must be unique
- Terms should be real biology terms that a college student would encounter
- Cover diverse topics: cell biology, genetics, ecology, biochemistry, anatomy, microbiology, evolution, etc.

Respond with ONLY valid JSON, no markdown, no explanation:
{
  "groups": [
    {
      "category": "Short category description",
      "difficulty": "yellow",
      "terms": ["TERM1", "TERM2", "TERM3", "TERM4"]
    },
    {
      "category": "Short category description",
      "difficulty": "green",
      "terms": ["TERM1", "TERM2", "TERM3", "TERM4"]
    },
    {
      "category": "Short category description",
      "difficulty": "blue",
      "terms": ["TERM1", "TERM2", "TERM3", "TERM4"]
    },
    {
      "category": "Short category description",
      "difficulty": "purple",
      "terms": ["TERM1", "TERM2", "TERM3", "TERM4"]
    }
  ]
}

Seed number: \${seed}
Each seed must produce a completely different puzzle.`;
  }

  const systemPrompt = promptTemplate.replace("${seed}", String(seed)).replace("{seed}", String(seed));

  const response = await fetch(
    "https://api.fireworks.ai/inference/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0,
        max_tokens: 1024,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Fireworks API error: ${response.status} ${response.statusText} -- ${text}`,
    );
  }

  const data = await response.json();
  const rawContent: string = data?.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("Fireworks API returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Fireworks API returned invalid JSON: ${rawContent}`);
  }

  if (!validatePuzzle(parsed)) {
    throw new Error(
      `Puzzle validation failed: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }

  return parsed;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment variables not set" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const todayStr = getTodayEasternString();
    const seed = getDaySeed();

    // Check cache
    const { data: existing, error: selectError } = await supabase
      .from("daily_puzzles")
      .select("puzzle, seed")
      .eq("date", todayStr)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      return new Response(
        JSON.stringify({ error: `Database read error: ${selectError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let puzzle: Puzzle;
    let activeSeed = seed;

    if (existing) {
      puzzle = existing.puzzle as Puzzle;
      activeSeed = existing.seed;
    } else {
      // Generate puzzle, retry once with seed+1000 on failure
      let lastError: Error | null = null;
      for (const attemptSeed of [seed, seed + 1000]) {
        try {
          puzzle = await fetchPuzzleFromFireworks(attemptSeed, supabase);
          activeSeed = attemptSeed;
          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (lastError) {
        return new Response(
          JSON.stringify({ error: `Puzzle generation failed: ${lastError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { error: insertError } = await supabase
        .from("daily_puzzles")
        .insert({ date: todayStr, seed: activeSeed, puzzle });

      if (insertError && insertError.code !== "23505") {
        return new Response(
          JSON.stringify({ error: `Database write error: ${insertError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // On race condition (23505), re-fetch the winner's puzzle
      if (insertError?.code === "23505") {
        const { data: refetched, error: refetchError } = await supabase
          .from("daily_puzzles")
          .select("puzzle, seed")
          .eq("date", todayStr)
          .single();

        if (refetchError || !refetched) {
          return new Response(
            JSON.stringify({ error: "Failed to re-fetch puzzle after race condition" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        puzzle = refetched.puzzle as Puzzle;
        activeSeed = refetched.seed;
      }
    }

    const allTerms = puzzle!.groups.flatMap((g) => g.terms);
    const shuffledTerms = seededShuffle(allTerms, activeSeed);
    const puzzleNumber = seed + 1;

    return new Response(
      JSON.stringify({
        date: todayStr,
        puzzle_number: puzzleNumber,
        terms: shuffledTerms,
        num_groups: 4,
        num_terms_per_group: 4,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
