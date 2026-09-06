import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.js"

function stderrJSON(stderr: string): { error: string; code: string } {
  return JSON.parse(stderr) as { error: string; code: string }
}

describe("flag validation", () => {
  test("an unknown flag exits 1 with a JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "php", "--bogus", "x"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(stderrJSON(r.stderr).code).toBe("UNKNOWN_FLAG")
  })

  test("--dates without --limit is refused, so it cannot fan out", async () => {
    const r = await runCLI(["search", "-q", "php", "--dates"])
    expect(r.exitCode).toBe(1)
    expect(stderrJSON(r.stderr).code).toBe("LIMIT_REQUIRED")
  })

  test("--jobage with too high a --limit is refused", async () => {
    const r = await runCLI(["search", "-q", "php", "--jobage", "14", "--limit", "500"])
    expect(r.exitCode).toBe(1)
    expect(stderrJSON(r.stderr).code).toBe("LIMIT_REQUIRED")
  })

  test("a non-numeric --jobage is rejected", async () => {
    const r = await runCLI(["search", "--jobage", "fortnight", "--limit", "5"])
    expect(r.exitCode).toBe(1)
    expect(stderrJSON(r.stderr).code).toBe("BAD_ARG")
  })

  test("a zero or negative --page is rejected", async () => {
    const r = await runCLI(["search", "--page", "0"])
    expect(r.exitCode).toBe(1)
    expect(stderrJSON(r.stderr).code).toBe("BAD_ARG")
  })

  test("a seniority outside the vocabulary is rejected", async () => {
    const r = await runCLI(["search", "--seniority", "wizard"])
    expect(r.exitCode).toBe(1)
    expect(stderrJSON(r.stderr).error).toContain("trainee | junior | mid | senior | expert")
  })

  test("detail without an id exits 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(stderrJSON(r.stderr).code).toBe("NO_ID")
  })

  test("an unknown command exits 1", async () => {
    const r = await runCLI(["browse"])
    expect(r.exitCode).toBe(1)
    expect(stderrJSON(r.stderr).code).toBe("BAD_CMD")
  })

  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("USAGE")
  })
})
