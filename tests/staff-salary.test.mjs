import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSalary } from "../lib/staff-salary.mjs";

test("normalizeSalary returns null for blank salary input", () => {
  assert.equal(normalizeSalary(""), null);
  assert.equal(normalizeSalary(null), null);
});

test("normalizeSalary accepts positive salary amounts", () => {
  assert.equal(normalizeSalary("0"), 0);
  assert.equal(normalizeSalary("25000"), 25000);
  assert.equal(normalizeSalary("25000.50"), 25000.5);
});

test("normalizeSalary rejects invalid salary amounts", () => {
  assert.throws(() => normalizeSalary("-1"), /Salary must be zero or a positive number/);
  assert.throws(() => normalizeSalary("abc"), /Salary must be zero or a positive number/);
});
