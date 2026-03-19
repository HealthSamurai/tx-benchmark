export interface Snapshot {
  server:            string;
  label:             string;
  timestamp:         string;
  cpu_usage:         number | null;
  mem_used_bytes:    number | null;
  data_volume_bytes: number | null;
}

export interface BenchmarkResult {
  server:     string;
  test:       string;
  vus:        number;
  run:        string;
  throughput: number;
  error_rate: number;
  duration: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    min: number;
    max: number;
  };
}

export type PreflightStatus = 'pass' | 'fail' | 'skip';

export interface PreflightResult {
  server: string;
  run:    string;
  tests:  Record<string, { status: PreflightStatus }>;
}
