import {
  BASE,
  SEARCH_PATH,
  DETAIL_PATH,
  htmlFetch,
  writeError,
  parseCards,
  parseJsonLdPosting,
  filterByAge,
  buildCriteria,
  citySlug,
  formatSalary,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  category?: string
  seniority?: string
  page: number
  jobage?: number
  dates: boolean
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildSearchUrl(opts: SearchOpts): string {
  const criteria = buildCriteria({
    keyword: opts.query,
    city: citySlug(opts.location),
    category: opts.category,
    seniority: opts.seniority,
  })
  // Built by hand rather than with URLSearchParams: that encodes spaces as "+",
  // and the criteria syntax verified against the live portal uses %20.
  const params: string[] = []
  if (criteria) params.push(`criteria=${encodeURIComponent(criteria)}`)
  if (opts.page > 1) params.push(`page=${opts.page}`)
  return BASE + SEARCH_PATH + (params.length ? `?${params.join("&")}` : "")
}

/**
 * Listing cards carry no publication date, so a date costs one extra request per
 * posting. This is opt-in (`--dates`, implied by `--jobage`) and deliberately
 * sequential with a small pause: the portal is read politely, not crawled.
 */
async function enrichDates(cards: JobCard[]): Promise<JobCard[]> {
  const out: JobCard[] = []
  for (const card of cards) {
    let date: string | null = null
    try {
      const html = await htmlFetch(`${BASE}${DETAIL_PATH}/${card.id}`)
      const posting = html ? parseJsonLdPosting(html) : null
      const raw = posting?.datePosted
      date = typeof raw === "string" && raw !== "" ? raw : null
    } catch {
      // a posting whose detail page failed keeps a null date rather than
      // aborting the whole search
    }
    out.push({ ...card, date })
    await new Promise((r) => setTimeout(r, 150))
  }
  return out
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  let html: string
  try {
    html = await htmlFetch(buildSearchUrl(opts))
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
    return 1
  }

  let results = parseCards(html)
  if (html && results.length === 0 && !/nfj-postings-item/.test(html)) {
    writeError(
      "nofluffjobs.com returned a page with no posting cards - the site's markup has probably changed; see url-reference.md for the parsing anchors",
      "PARSE_FAILED",
    )
    return 1
  }

  // Cap before enriching: dates cost one request each, so the limit must bound
  // the request count, not just the printed output.
  if (opts.limit !== undefined && opts.limit >= 0) results = results.slice(0, opts.limit)
  if (opts.dates || opts.jobage !== undefined) results = await enrichDates(results)
  if (opts.jobage !== undefined) results = filterByAge(results, opts.jobage)

  if (opts.format === "json") {
    process.stdout.write(
      JSON.stringify({ meta: { count: results.length, page: opts.page }, results }, null, 2) + "\n",
    )
    return 0
  }

  if (results.length === 0) {
    process.stdout.write("No offers found.\n")
    return 0
  }

  if (opts.format === "plain") {
    for (const r of results) {
      process.stdout.write(
        `${r.title}\n  ${r.company ?? "-"} | ${r.location ?? "-"}${r.extraLocations ? ` +${r.extraLocations}` : ""}\n` +
          `  ${r.date ?? "date not fetched"} | ${formatSalary(r.salary)}\n  ${r.tags.join(", ")}\n  ${r.url}\n\n`,
      )
    }
    return 0
  }

  const rows = results.map((r) => [
    (r.title ?? "").slice(0, 44),
    (r.company ?? "-").slice(0, 22),
    (r.location ?? "-").slice(0, 14),
    r.date ?? "-",
    formatSalary(r.salary).slice(0, 22),
  ])
  const headers = ["TITLE", "COMPANY", "LOCATION", "POSTED", "SALARY"]
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)))
  const line = (cells: string[]) => cells.map((c, i) => (c ?? "").padEnd(widths[i]!)).join("  ").trimEnd()
  process.stdout.write(line(headers) + "\n")
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n")
  for (const r of rows) process.stdout.write(line(r) + "\n")
  return 0
}
