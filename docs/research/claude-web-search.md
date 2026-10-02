# Claude API web search tool for study-material links

Research for [#43](https://github.com/ohmanurak/cognitive-gym/issues/43). Checked 2026-10-02 against the official Claude docs and `@anthropic-ai/sdk` 0.131.0.

Labels: **[F]** = fact, stated by a cited source or checked by hand. **[I]** = inference or recommendation, not stated by a source.

## Bottom line

- Use the server-side `web_search` tool with type **`web_search_20260318`** on **`claude-sonnet-5-5`** at low/medium effort. Set `max_uses` to 3–5. Use the API key only on the server, inside a Vite `configureServer` middleware. [I, built on the facts below]
- Expected cost is about **$0.05–0.15 per recommendation request**. At this volume, the $10 per 1,000 searches fee is usually as large as the token cost, or larger. [I, estimate]
- **Biasing results:** `allowed_domains` is a hard filter. It is the only reliable way to get YouTube-only results. You can't list "all blogs" as a domain, so run two calls: one limited to YouTube and one limited to a curated list of blog domains. Or run one call that blocks junk domains and steers toward blogs in the prompt. [F for the mechanics, I for the strategy]
- **Dead or paywalled links:** don't trust model-written URLs. Keep only URLs that came back in `web_search_result` blocks. Then check them on the server. For YouTube, use the oEmbed endpoint (200 = live, 400/401/404 = dead or private). For blogs, send a HEAD request and fall back to GET, then look for the `isAccessibleForFree:false` paywall markup. The `web_fetch` tool is a weaker fallback: it caches, doesn't run JavaScript, and costs input tokens. [F/I mixed, see below]

## 1. Tool versions and config

**Versions [F]** ([web search docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference)):

| `type` | Adds |
|---|---|
| `web_search_20250305` | Basic search. Every result is loaded into context. |
| `web_search_20260209` | **Dynamic filtering.** Claude writes code that filters results before they reach context. Claude 4.6+ only. |
| `web_search_20260318` | Dynamic filtering plus `response_inclusion` (`"full"` \| `"excluded"`), which drops nested search blocks consumed by code execution from the response. Saves output and transfer size. |

`name` is always `"web_search"`. No beta header is needed. Your org has web search enabled unless an admin turned it off in Console → Settings → Capabilities. If it's off, requests return 400 `invalid_request_error`. [F]

**Params [F]** (from the web search docs and [server tools → domain filtering](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools#domain-filtering); field list checked against the SDK's `WebSearchTool20260318` interface):

- `max_uses` caps the number of searches per request. Going over it returns a `max_uses_exceeded` error inside the result block. The docs say simple queries take 1–3 searches and comparative research takes 10 or more.
- `allowed_domains` **or** `blocked_domains`, never both (400 if both are sent).
  - Use the bare domain with no scheme. Subdomains are included automatically (`youtube.com` covers `m.youtube.com`).
  - A specific subdomain narrows the match to that subdomain only.
  - For **web search, paths are supported** (`example.com/blog` matches `example.com/blog/*`).
  - Wildcards are allowed only in the path (`example.com/*/articles`), never in the host.
  - Use ASCII only (homograph warning).
  - A request-level allow list must be a subset of any org-level allow list set in Console.
- `user_location` takes `{type:"approximate", city?, region?, country? (ISO-3166 alpha-2), timezone? (IANA)}` and needs at least one field. An unsupported country returns 400.
- `allowed_callers`: on `_20260209`+ the default is `["code_execution_20260120"]`, which turns on dynamic filtering. Set `["direct"]` to turn filtering off. That setting is **required on models without programmatic tool calling, which includes Haiku 4.5** ([PTC docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling): "Claude Haiku 4.5 … doesn't support programmatic tool calling"). It is also needed for ZDR.
- Also available: `cache_control`, `defer_loading`, `strict`.

**Platform [F]:** the full feature set is on the Claude API. Google Cloud has basic search only. Bedrock has no web search. This doesn't matter here because we call the first-party API.

## 2. Response and citation format [F]

Source: [web search docs → Response](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool#response).

```jsonc
{ "type": "server_tool_use", "id": "srvtoolu_…", "name": "web_search", "input": { "query": "…" } }
{ "type": "web_search_tool_result", "tool_use_id": "srvtoolu_…",
  "content": [ { "type": "web_search_result", "url": "…", "title": "…",
                 "page_age": "April 30, 2025", "encrypted_content": "…" } ] }
{ "type": "text", "text": "…", "citations": [
    { "type": "web_search_result_location", "url": "…", "title": "…",
      "encrypted_index": "…", "cited_text": "≤150 chars" } ] }
```

- Citations are **always on** for web search. `cited_text`, `title` and `url` in citations are **not billed** as tokens.
- If you show API output directly to end users, you **must show citations** to the original source.
- For multi-turn use, send the assistant blocks back unchanged. If `encrypted_content` or `encrypted_index` is altered, the request fails with 400.
- **Errors come back as HTTP 200.** On failure, `content` is a single `{type:"web_search_tool_result_error", error_code}` object instead of a list. Possible codes: `too_many_requests`, `invalid_tool_input`, `max_uses_exceeded`, `query_too_long`, `request_too_large`, `unavailable`. Zero hits return `[]`, which is not an error. Failed searches aren't billed.
- `stop_reason: "pause_turn"` can happen on long server-side loops. To continue, re-send the paused assistant content with the **same `tools` array**, and cap the number of continuations ([server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools#the-server-side-loop-and-pause-turn)).
- With dynamic filtering, the response also contains code-execution blocks. Nested search blocks carry a `caller` field. Setting `response_inclusion: "excluded"` drops the nested blocks that were consumed by completed code execution.
- `usage.server_tool_use.web_search_requests` counts the billed searches.

## 3. Pricing [F] and estimate [I]

From [pricing](https://platform.claude.com/docs/en/about-claude/pricing):

- Web search costs **$10 per 1,000 searches** ($0.01 each). Search results count as **input tokens**, both in the turn that ran the search and in later turns that resend them.
- Code execution used by dynamic filtering is **free**; you pay tokens only. `web_fetch` has **no fee**; you pay tokens only (about 2.5k tokens for an average page).

| Model | Input $/MTok | Output $/MTok | Dynamic filtering |
|---|---|---|---|
| `claude-opus-5-5` | 4 | 20 | yes |
| `claude-sonnet-5-5` | 2 | 10 | yes |
| `claude-haiku-4-5` | 1 | 5 | **no** (basic or `allowed_callers:["direct"]`) |

The newer tokenizer on 4.7+ models produces about 30% more tokens for the same text [F, pricing page].

**Per-request estimate [I]** (assumes 3 searches, about 20k input tokens of results after filtering, and about 1.5k output tokens):

- Sonnet 5.5: 3×$0.01 + 20k×$2/M + 1.5k×$10/M ≈ **$0.085**
- Haiku 4.5 (no filtering, so maybe about 40k input): $0.03 + $0.04 + $0.0075 ≈ **$0.08**
- Opus 5.5: ≈ $0.14

The search fee is fixed per search on every model, so a cheaper model saves little. Measure real `usage` before tuning.

## 4. Which model [I]

- **Recommend `claude-sonnet-5-5`.** It costs about the same as Haiku here because dynamic filtering cuts input tokens. It is stronger at judging whether a video or post actually teaches reasoning, it supports `web_search_20260318` with filtering, and it supports structured outputs.
- Sonnet 5.5 notes [F, from the claude-api skill and migration notes]:
  - `thinking:{type:"disabled"}` returns 400. Leave thinking adaptive and set `output_config:{effort:"low"}`.
  - Forced `tool_choice` `any`/`tool` returns 400. Use `auto` plus a prompt instruction.
  - Classifier refusals arrive as `stop_reason:"refusal"`. Check `stop_reason` before reading content.
- `claude-haiku-4-5` is fine if you want the cheapest option. Use `web_search_20250305`, or `_20260318` with `allowed_callers:["direct"]`.
- Opus 5.5 is overkill for curating links.

## 5. Rate limits [F]

From [rate limits](https://platform.claude.com/docs/en/api/rate-limits):

| Tier | Opus 5.5 / Sonnet 5.5 / Haiku 4.5 (each a separate bucket) | Monthly spend cap |
|---|---|---|
| Start | 1,000 RPM · 2M ITPM · 400k OTPM | $500 |
| Build | 5,000 RPM · 5M ITPM · 1M OTPM | $1,000 |
| Scale | 10,000 RPM · 10M ITPM · 2M OTPM | $200,000 |

- New orgs may start in a lower **Evaluation** tier.
- Cache reads don't count toward ITPM.
- A 429 includes a `retry-after` header.
- The spend-cap 429 has `error.details.error_code: "enforced_spend_limit_reached"` and **no** `retry-after`.
- Web search has its own org-level throttle, which shows up as a `too_many_requests` error inside the result block. The Console Rate-limits page shows the org's web search limit; the docs state it only for Batches.
- A single-user dev app will not get near any of these limits [I].

## 6. Calling it from the Vite dev middleware [F for the API shapes, I for the design]

The pattern follows `app/vite.config.ts` → `progressFile()`.

- Add the dependency: `npm i @anthropic-ai/sdk` (0.131.0 ships the `WebSearchTool20260318` type). Using it only on the dev server keeps it out of the client bundle.
- **Key handling [F, Vite docs]:**
  - Vite exposes only `VITE_`-prefixed env vars to client code, so **never** name the key `VITE_ANTHROPIC_API_KEY`.
  - `vite.config.ts` does not load `.env` into `process.env` automatically. Use `loadEnv(mode, process.cwd(), '')` ([env & mode](https://vite.dev/guide/env-and-mode), [config env](https://vite.dev/config/#using-environment-variables-in-config)).
  - `new Anthropic()` reads `ANTHROPIC_API_KEY` from `process.env` by default.

```ts
// app/server/studyLinks.ts  (sketch - not committed)
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic() // ANTHROPIC_API_KEY from env

export type StudyLink = { url: string; title: string; pageAge?: string | null }

export async function findStudyLinks(topic: string, domains: string[]): Promise<{ text: string; links: StudyLink[] }> {
  const tools = [{
    type: 'web_search_20260318' as const,
    name: 'web_search' as const,
    max_uses: 4,
    allowed_domains: domains,          // e.g. ['youtube.com'] or a curated blog list
    response_inclusion: 'excluded' as const,
  }]
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: `Find 3-5 free, high-quality explanations (videos or articles) that teach: ${topic}. ` +
             `Prefer beginner-friendly material, avoid paywalled sites. One line per pick explaining why.`,
  }]

  let res = await client.messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 4000,
    output_config: { effort: 'low' }, tools, messages,
  })
  for (let i = 0; res.stop_reason === 'pause_turn' && i < 3; i++) {
    messages.push({ role: 'assistant', content: res.content })
    res = await client.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 4000,
      output_config: { effort: 'low' }, tools, messages })
  }
  if (res.stop_reason === 'refusal') throw new Error('refused')

  // Only trust URLs the search tool actually returned (never model-typed URLs).
  const links = new Map<string, StudyLink>()
  for (const b of res.content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) links.set(r.url, { url: r.url, title: r.title, pageAge: r.page_age })
    }
  }
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  return { text, links: [...links.values()] }
}
```

```ts
// in vite.config.ts, alongside progressFile():
server.middlewares.use('/api/study-links', async (req, res) => { /* POST {topic} -> findStudyLinks -> send(200, …) */ })
```

Caveats [I]:

- With `response_inclusion: "excluded"`, search results consumed inside dynamic filtering are removed from the response. To harvest URLs, prefer the **citations** (`text` blocks → `citations[].url`) or leave it at `"full"`. Check this on a real response before choosing.
- `output_config.format` (structured outputs) is supported on Sonnet 5.5 and Haiku 4.5, and the docs list no incompatibility with web search, but **this pairing is untested**. Parsing citations and result blocks is the safer path.
- Keep the middleware `apply: 'serve'` so it runs only on the dev server. A production build would need a real backend; this is out of scope here.

## 7. Biasing toward YouTube and blogs [F mechanics, I strategy]

- `allowed_domains: ["youtube.com"]` makes every result a YouTube URL (hard filter, subdomains included). `youtube.com/watch` narrows results to video pages, because paths work for web search.
- "Blogs" aren't a domain. Options:
  1. **Curated allow list** of trusted reasoning/learning sites, e.g. `lesswrong.com`, `fs.blog`, `betterexplained.com`, `brilliant.org/wiki`, `substack.com`. Hard guarantee, narrower recall.
  2. **`blocked_domains`** for SEO farms and paywalls (e.g. `medium.com` if paywalls are a problem) plus a prompt like "prefer personal blogs and explainer articles." Broader recall, soft bias.
- You can't send both lists in one tool. The `name` is fixed to `web_search`, so you also can't declare two web_search tools with different filters in one request (inference from the fixed `name`). → **Make two parallel requests** (YouTube and blogs) and merge. That costs about 2× the searches, roughly $0.02–0.04 extra.
- `user_location` (e.g. `country`) localizes results, which helps with language and region. The system prompt can also steer when Claude searches.

## 8. Detecting dead or paywalled links

| Check | How | Notes |
|---|---|---|
| Only return search-sourced URLs | Take URLs from `web_search_result.url` or citations | Removes hallucinated URLs [I] |
| YouTube liveness | `GET https://www.youtube.com/oembed?url=<watch-url>&format=json` | **Checked by hand 2026-10-02:** live video → 200 + title/author JSON; made-up ID → **400**. Private or removed videos often return 401/404 [I, not tested]. Treat anything other than 200 as dead. Free, no key. |
| Generic liveness | Server-side `fetch(url, {method:'HEAD', redirect:'follow'})`; on 405/403 retry `GET` with `Range: bytes=0-0` | Many sites reject HEAD [I]. Treat 404/410/5xx as dead. Put a timeout on every request. |
| Paywall | GET the HTML and look for JSON-LD `"isAccessibleForFree": false` | This is how publishers mark paywalls for Google ([Google docs](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content)) [F]. It's a heuristic: not every paywall uses it [I]. Also flag a known paywall-domain list. |
| `web_fetch` tool (alternative) | Add `{type:"web_fetch_20260318", name:"web_fetch", max_uses, max_content_tokens}` | [F] ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool)): no fee, but tokens are billed. Returns `url_not_accessible` on HTTP errors. Can fetch only URLs already in the conversation (search results count). **Caches** results (`use_cache:false` needs `_20260309`+). **Doesn't render JavaScript**, which hurts on YouTube. Text/HTML/PDF only. Can also read page content for a paywall verdict, at about 2.5k tokens per page. |

**Recommendation [I]:** do link checks in plain Node inside the same middleware (oEmbed for YouTube, HEAD/GET plus JSON-LD sniff for others) after the Claude call returns. Drop failures, then cache the verdict by URL with a TTL. This is cheaper and more predictable than `web_fetch`.

## Open questions / to verify in a spike

1. Do URLs survive in the response with `response_inclusion:"excluded"`, or do we need `"full"`?
2. Do structured outputs combine cleanly with web search and citations?
3. Real token use per request. Log `usage` for about 10 topics.
4. oEmbed status codes for private and removed (not just nonexistent) videos.

## Sources

- Web search tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- Server tools (domain filtering, pause_turn, allowed_callers): https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools
- Tool reference (versions): https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference
- Web fetch tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
- Programmatic tool calling (model support, Haiku 4.5 exclusion): https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Rate limits: https://platform.claude.com/docs/en/api/rate-limits
- Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- `@anthropic-ai/sdk` 0.131.0 type defs (`resources/messages/messages.d.ts`, `WebSearchTool20260318`)
- Vite env: https://vite.dev/guide/env-and-mode · https://vite.dev/config/#using-environment-variables-in-config
- Google paywalled-content markup: https://developers.google.com/search/docs/appearance/structured-data/paywalled-content
