import { waitUntil } from "@vercel/functions";

type Recipe = {
  name?: string;
  description?: string;
  image?: string | string[] | { url?: string } | Array<{ url?: string }>;
  recipeYield?: string | string[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeIngredient?: string[] | string;
  recipeInstructions?:
    | string
    | Array<
        string | { text?: string; name?: string; itemListElement?: unknown }
      >
    | { text?: string; itemListElement?: unknown };
  author?: { name?: string } | Array<{ name?: string }>;
};

const ALLOWED_HOSTS = new Set(["bonappetit.com", "www.bonappetit.com"]);

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response("Missing url parameter.", { status: 400 });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("Invalid url parameter.", { status: 400 });
    }

    if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return new Response("Only bonappetit.com URLs are allowed.", {
        status: 400,
      });
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        "user-agent": "ba-recipe-extractor/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return new Response(`Upstream request failed (${response.status}).`, {
        status: 502,
      });
    }

    const html = await response.text();
    const recipe = extractRecipeFromHtml(html);

    waitUntil(
      Promise.resolve().then(() => {
        console.log("Fetched recipe HTML", {
          target: targetUrl.toString(),
          status: response.status,
          recipeFound: Boolean(recipe),
        });
      }),
    );

    if (!recipe) {
      return new Response("No Recipe JSON-LD found on that page.", {
        status: 422,
      });
    }

    return Response.json(recipe, {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    });
  },
};

function extractRecipeFromHtml(html: string): Recipe | null {
  const scripts = findJsonLdScripts(html);
  const jsonObjects: unknown[] = [];

  for (const raw of scripts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      jsonObjects.push(...flattenJsonLd(parsed));
    } catch {
      continue;
    }
  }

  const recipe = jsonObjects.find((item) => isRecipe(item)) as
    | Recipe
    | undefined;
  return recipe ?? null;
}

function findJsonLdScripts(html: string) {
  const matches = html.match(
    /<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!matches) return [];

  return matches
    .map((match) => match.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, ""))
    .map((content) => content.trim())
    .filter(Boolean);
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonLd(entry));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const graph = record["@graph"];
    if (Array.isArray(graph)) {
      return [value, ...graph.flatMap((entry) => flattenJsonLd(entry))];
    }
    return [value];
  }
  return [];
}

function isRecipe(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const type = record["@type"];

  if (Array.isArray(type)) {
    return type.includes("Recipe");
  }

  return type === "Recipe";
}
