export function normalizeSalary(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const salary = Number(value);

  if (!Number.isFinite(salary) || salary < 0) {
    throw new Error("Salary must be zero or a positive number");
  }

  return salary;
}
