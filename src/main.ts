import "./style.css";

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

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

app.innerHTML = `
  <main class="page">
    <section class="panel hero">
      <div class="hero-copy">
        <p class="eyebrow">Bon Appetit Recipe Helper</p>
        <h1>Paste a Bon Appetit link. Get a clean recipe card.</h1>
        <p class="lead">Drop in a recipe URL and we’ll pull out the ingredients and steps for easy reading.</p>
      </div>
      <form id="recipe-form" class="hero-form" autocomplete="off">
        <label class="field">
          <span class="label">Recipe URL</span>
          <div class="input-wrap">
            <input id="recipe-url" name="recipe-url" type="url" placeholder="https://www.bonappetit.com/recipe/..." required />
            <button type="submit" class="primary">Extract</button>
          </div>
        </label>
        <div class="hint-row">
          <button type="button" id="share-button" class="ghost">Share link</button>
          <span class="hint">Share the recipe card with anyone.</span>
        </div>
      </form>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </section>

    <section class="panel output" aria-live="polite">
      <div id="output" class="output-inner">
        <p class="empty">No recipe yet. Paste a link above to get started.</p>
      </div>
    </section>
  </main>
`;

const form = document.querySelector<HTMLFormElement>("#recipe-form");
const input = document.querySelector<HTMLInputElement>("#recipe-url");
const statusEl = document.querySelector<HTMLDivElement>("#status");
const output = document.querySelector<HTMLDivElement>("#output");
const shareButton =
  document.querySelector<HTMLButtonElement>("#share-button");
if (!form || !input || !statusEl || !output || !shareButton) {
  throw new Error("Missing required elements");
}

const inputEl = input;
const statusElEl = statusEl;
const outputEl = output;
const shareButtonEl = shareButton;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleSubmit();
});

shareButtonEl.addEventListener("click", async () => {
  const url = normalizeUrl(inputEl.value);
  const shareUrl = buildShareUrl(url);
  try {
    if (navigator.share) {
      await navigator.share({
        title: "Bon Appetit Recipe",
        url: shareUrl,
      });
      setStatus("Share sheet opened.", "success");
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setStatus("Share link copied to clipboard.", "success");
  } catch {
    setStatus("Could not share the link.", "error");
  }
});

const initialUrl = getInitialUrl();
if (initialUrl) {
  inputEl.value = initialUrl;
  handleSubmit().catch(() => {
    setStatus("Could not load the shared recipe.", "error");
  });
}

async function handleSubmit() {
  setStatus("Fetching recipe...", "loading");
  outputEl.innerHTML = "";

  try {
    const url = normalizeUrl(inputEl.value);
    updateShareUrl(url);
    const recipe = await fetchRecipe(url);

    setStatus("Recipe extracted successfully.", "success");
    renderRecipe(recipe);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    setStatus(message, "error");
    renderEmpty("Double-check the URL and try again.");
  }
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Please enter a recipe URL.");
  }

  if (trimmed.startsWith("/")) {
    return new URL(trimmed, window.location.origin).toString();
  }

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
}

function getInitialUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("recipe") ?? "";
}

function buildShareUrl(recipeUrl: string) {
  const base = new URL(window.location.href);
  base.searchParams.set("recipe", recipeUrl);
  return base.toString();
}

function updateShareUrl(recipeUrl: string) {
  const shareUrl = buildShareUrl(recipeUrl);
  window.history.replaceState({}, "", shareUrl);
}

async function fetchRecipe(url: string): Promise<Recipe> {
  const apiUrl = `/api/recipe?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Request failed (${res.status}).`);
  }
  return await res.json();
}

function renderRecipe(recipe: Recipe) {
  outputEl.innerHTML = "";

  const title = createTextBlock("h2", recipe.name ?? "Untitled recipe");
  const description = recipe.description
    ? createTextBlock("p", recipe.description, "description")
    : null;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.append(
    createMetaItem("Yield", formatMaybeArray(recipe.recipeYield)),
    createMetaItem("Prep", recipe.prepTime),
    createMetaItem("Cook", recipe.cookTime),
    createMetaItem("Total", recipe.totalTime),
    createMetaItem("Author", formatAuthor(recipe.author)),
  );

  const media = buildImage(recipe.image);

  const ingredients = normalizeIngredients(recipe.recipeIngredient);
  const instructions = normalizeInstructions(recipe.recipeInstructions);

  const ingredientList = buildList("Ingredients", ingredients);
  const instructionList = buildList("Instructions", instructions, true);

  const card = document.createElement("article");
  card.className = "recipe-card";
  card.append(title);
  if (description) card.append(description);
  if (media) card.append(media);
  card.append(meta);
  card.append(ingredientList);
  card.append(instructionList);

  outputEl.append(card);
}

function renderEmpty(message: string) {
  outputEl.innerHTML = "";
  const note = createTextBlock("p", message, "empty");
  outputEl.append(note);
}

function createTextBlock(tag: "p" | "h2", text: string, className?: string) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function createMetaItem(label: string, value?: string | null) {
  const item = document.createElement("div");
  item.className = "meta-item";

  const title = document.createElement("span");
  title.className = "meta-label";
  title.textContent = label;

  const body = document.createElement("span");
  body.className = "meta-value";
  body.textContent = value && value.length > 0 ? value : "—";

  item.append(title, body);
  return item;
}

function buildImage(image: Recipe["image"]) {
  const url = resolveImageUrl(image);
  if (!url) return null;

  const figure = document.createElement("figure");
  figure.className = "recipe-media";

  const img = document.createElement("img");
  img.src = url;
  img.alt = "Recipe photo";
  img.loading = "lazy";

  figure.append(img);
  return figure;
}

function buildList(title: string, items: string[], ordered = false) {
  const section = document.createElement("section");
  section.className = "list-section";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const list = document.createElement(ordered ? "ol" : "ul");
  list.className = "list";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No items found.";
    section.append(heading, empty);
    return section;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });

  section.append(heading, list);
  return section;
}

function normalizeIngredients(value: Recipe["recipeIngredient"]) {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((item) => item.trim()).filter(Boolean);
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeInstructions(value: Recipe["recipeInstructions"]): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item?.text) return [item.text];
        if (typeof item?.itemListElement === "string")
          return [item.itemListElement];
        return [];
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (value.text) {
    return [value.text.trim()].filter(Boolean);
  }

  return [];
}

function formatAuthor(author: Recipe["author"]) {
  if (!author) return undefined;
  if (Array.isArray(author)) {
    return author
      .map((entry) => entry?.name)
      .filter(Boolean)
      .join(", ");
  }
  return author.name;
}

function formatMaybeArray(value?: string | string[]) {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join(", ") : value;
}

function resolveImageUrl(value: Recipe["image"]) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") return first;
    return first?.url ?? null;
  }
  if (typeof value === "object") return value.url ?? null;
  return null;
}

function setStatus(message: string, state: "loading" | "success" | "error") {
  statusElEl.textContent = message;
  statusElEl.dataset.state = state;
}
