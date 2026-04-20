// Memory bandwidth (GB/s) per Apple Silicon chip variant.
// Source: Apple product pages. Update here when new chips are released,
// then update score.js tests to cover the new variant.
export const BANDWIDTH_TABLE = {
  "M1":        68,
  "M1 Pro":   200,
  "M1 Max":   400,
  "M1 Ultra": 800,
  "M2":       100,
  "M2 Pro":   200,
  "M2 Max":   400,
  "M2 Ultra": 800,
  "M3":       100,
  "M3 Pro":   150,
  "M3 Max":   400,
  "M4":       120,
  "M4 Pro":   273,
  "M4 Max":   546,
};
