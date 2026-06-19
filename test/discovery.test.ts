import { describe, it, expect } from "vitest";
import {
  scanFailingTests,
  scanStaleDeps,
  scanTodos,
  capDiscoveries,
  discoveryTick,
  type DiscoveredWork,
  type DiscoverySource,
} from "../src/loop/discovery.js";

describe("scanFailingTests", () => {
  it("finds FAIL lines in vitest output", () => {
    const output = `
 FAIL test/foo.test.ts [ test/foo.test.ts ]
 ✓ test/bar.test.ts
 FAIL test/baz.test.ts
`;
    const work = scanFailingTests(output);
    expect(work).toHaveLength(2);
    expect(work[0].title).toContain("test/foo.test.ts");
    expect(work[1].title).toContain("test/baz.test.ts");
    expect(work[0].type).toBe("failing-test");
    expect(work[0].priority).toBe("high");
    expect(work[0].bounded).toBe(true);
  });

  it("finds × lines for individual test failures", () => {
    const output = ` × should return true
 ✓ should return false`;
    const work = scanFailingTests(output);
    expect(work).toHaveLength(1);
    expect(work[0].title).toContain("should return true");
  });

  it("deduplicates by title", () => {
    const output = ` FAIL test/foo.test.ts
 FAIL test/foo.test.ts`;
    const work = scanFailingTests(output);
    expect(work).toHaveLength(1);
  });

  it("returns empty for passing tests", () => {
    const output = ` ✓ test/foo.test.ts
 ✓ test/bar.test.ts`;
    expect(scanFailingTests(output)).toEqual([]);
  });

  it("includes a machine-checkable done-contract", () => {
    const work = scanFailingTests("FAIL test/foo.test.ts");
    expect(work[0].doneContract).toContain("npm test");
    expect(work[0].doneContract).toContain("test/foo.test.ts");
  });
});

describe("scanStaleDeps", () => {
  it("parses npm outdated --json output", () => {
    const pkg = '{"dependencies":{"foo":"^1.0.0"}}';
    const outdated = JSON.stringify({
      foo: { current: "1.0.0", wanted: "1.1.0", latest: "2.0.0" },
    });
    const work = scanStaleDeps(pkg, outdated);
    expect(work).toHaveLength(1);
    expect(work[0].title).toContain("foo");
    expect(work[0].title).toContain("1.0.0");
    expect(work[0].title).toContain("2.0.0");
    expect(work[0].type).toBe("stale-dep");
  });

  it("marks major version bumps as medium priority", () => {
    const outdated = JSON.stringify({
      bar: { current: "1.0.0", wanted: "1.1.0", latest: "3.0.0" },
    });
    const work = scanStaleDeps("{}", outdated);
    expect(work[0].priority).toBe("medium");
  });

  it("marks patch bumps as low priority", () => {
    const outdated = JSON.stringify({
      baz: { current: "1.0.0", wanted: "1.0.1", latest: "1.0.1" },
    });
    const work = scanStaleDeps("{}", outdated);
    expect(work[0].priority).toBe("low");
  });

  it("returns empty for invalid JSON", () => {
    expect(scanStaleDeps("{}", "not json")).toEqual([]);
  });
});

describe("scanTodos", () => {
  it("finds TODO comments", () => {
    const files = [{ path: "src/foo.ts", content: "function bar() {\n  // TODO: implement this\n}" }];
    const work = scanTodos(files);
    expect(work).toHaveLength(1);
    expect(work[0].title).toContain("TODO");
    expect(work[0].title).toContain("implement this");
    expect(work[0].title).toContain("src/foo.ts:2");
  });

  it("finds FIXME as medium priority", () => {
    const files = [{ path: "src/bar.ts", content: "// FIXME: broken" }];
    const work = scanTodos(files);
    expect(work[0].priority).toBe("medium");
  });

  it("finds HACK as low priority", () => {
    const files = [{ path: "src/baz.ts", content: "// HACK: workaround" }];
    const work = scanTodos(files);
    expect(work[0].priority).toBe("low");
  });

  it("returns empty for files without TODOs", () => {
    const files = [{ path: "src/clean.ts", content: "function clean() { return true; }" }];
    expect(scanTodos(files)).toEqual([]);
  });
});

describe("capDiscoveries", () => {
  it("caps to the maximum", () => {
    const work: DiscoveredWork[] = [
      { type: "todo", title: "T1", description: "", doneContract: "", priority: "low", bounded: true },
      { type: "todo", title: "T2", description: "", doneContract: "", priority: "high", bounded: true },
      { type: "todo", title: "T3", description: "", doneContract: "", priority: "medium", bounded: true },
    ];
    expect(capDiscoveries(work, 2)).toHaveLength(2);
  });

  it("sorts by priority — high first", () => {
    const work: DiscoveredWork[] = [
      { type: "todo", title: "low", description: "", doneContract: "", priority: "low", bounded: true },
      { type: "todo", title: "high", description: "", doneContract: "", priority: "high", bounded: true },
      { type: "todo", title: "med", description: "", doneContract: "", priority: "medium", bounded: true },
    ];
    const capped = capDiscoveries(work, 3);
    expect(capped[0].title).toBe("high");
    expect(capped[1].title).toBe("med");
    expect(capped[2].title).toBe("low");
  });
});

describe("discoveryTick", () => {
  it("aggregates from multiple sources and caps", () => {
    const source1: DiscoverySource = {
      name: "tests",
      scan: () => [
        { type: "failing-test", title: "F1", description: "", doneContract: "", priority: "high", bounded: true },
      ],
    };
    const source2: DiscoverySource = {
      name: "todos",
      scan: () => [
        { type: "todo", title: "T1", description: "", doneContract: "", priority: "low", bounded: true },
        { type: "todo", title: "T2", description: "", doneContract: "", priority: "medium", bounded: true },
      ],
    };
    const work = discoveryTick([source1, source2], 2);
    expect(work).toHaveLength(2);
    // High priority should come first
    expect(work[0].title).toBe("F1");
  });

  it("returns empty when sources find nothing", () => {
    const emptySource: DiscoverySource = { name: "empty", scan: () => [] };
    expect(discoveryTick([emptySource], 5)).toEqual([]);
  });
});
