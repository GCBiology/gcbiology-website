import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface PuzzleGroup {
  category: string;
  difficulty: string;
  terms: string[];
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let body: { date?: unknown; selected_terms?: unknown; mistakes?: unknown };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { date: rawDate, selected_terms: rawTerms, mistakes: rawMistakes } = body;

    if (
      typeof rawDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ) {
      return new Response(
        JSON.stringify({ error: "date must be in YYYY-MM-DD format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (
      !Array.isArray(rawTerms) ||
      rawTerms.length !== 4 ||
      !rawTerms.every((t) => typeof t === "string")
    ) {
      return new Response(
        JSON.stringify({ error: "selected_terms must be an array of exactly 4 strings" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const mistakes = Number(rawMistakes);
    if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > 3) {
      return new Response(
        JSON.stringify({ error: "mistakes must be an integer between 0 and 3" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const date = rawDate;
    const selectedTerms: string[] = (rawTerms as string[]).map((t) =>
      t.toUpperCase().trim()
    );

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

    const { data, error: dbError } = await supabase
      .from("daily_puzzles")
      .select("puzzle")
      .eq("date", date)
      .single();

    if (dbError) {
      if (dbError.code === "PGRST116") {
        return new Response(
          JSON.stringify({ error: `No puzzle found for date: ${date}` }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return new Response(
        JSON.stringify({ error: `Database error: ${dbError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const groups: PuzzleGroup[] = (data.puzzle as { groups: PuzzleGroup[] }).groups;

    // Normalize all group terms to uppercase for comparison
    const normalizedGroups = groups.map((g) => ({
      ...g,
      terms: g.terms.map((t) => t.toUpperCase().trim()),
    }));

    // Find if selected terms exactly match any group
    const matchedGroup = normalizedGroups.find((g) => {
      const groupSet = new Set(g.terms);
      return (
        selectedTerms.length === 4 &&
        selectedTerms.every((t) => groupSet.has(t)) &&
        groupSet.size === 4
      );
    });

    if (matchedGroup) {
      return new Response(
        JSON.stringify({
          correct: true,
          category: matchedGroup.category,
          difficulty: matchedGroup.difficulty,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Incorrect: compute max overlap across all groups
    const numMatching = Math.max(
      ...normalizedGroups.map(
        (g) =>
          selectedTerms.filter((t) => g.terms.includes(t)).length,
      ),
    );

    // Game over on 4th mistake (mistakes was 3 before this guess)
    if (mistakes === 3) {
      const allGroups = normalizedGroups.map((g) => ({
        category: g.category,
        difficulty: g.difficulty,
        terms: g.terms,
      }));
      return new Response(
        JSON.stringify({ correct: false, game_over: true, all_groups: allGroups }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ correct: false, num_matching: numMatching }),
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
