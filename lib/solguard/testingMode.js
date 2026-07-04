/** When TESTING_MODE_FREE_RUNS=true, agent runs skip payment (auth still required). */
export function isTestingModeFreeRuns() {
  return process.env.TESTING_MODE_FREE_RUNS === "true";
}
