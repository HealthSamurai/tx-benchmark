export interface BenchmarkPoint {
  rps:       number;
  p50:       number;
  p95:       number;
  p99:       number;
  avg:       number;
  min:       number;
  max:       number;
  errorRate: number;
}

export interface ServerData {
  id:          string;
  version?:    string;
  score:       number;
  rawScore:    number;
  snapshot: {
    cpuPct:       number | null;
    memBytes:     number | null;
    dataBytes:    number | null;
    peakMemBytes: number | null;
  };
  preflight:   Record<string, string>;
  rawRps:      Record<string, number>;
  imputedRps:  Record<string, number>;
  weightedRps: Record<string, number>;
  benchmark:   Record<string, Record<string, BenchmarkPoint>>;
}

export interface RunHost {
  cpu:    string;
  ram:    string;
  os:     string;
  docker: {
    runtime: string;
    version: string;
    cpus:    number;
    memory:  string;
  };
}

export interface RunExport {
  run:   string;
  date:  string;
  host?: RunHost;
  config: {
    vus:              number[];
    tests:            string[];
    testDuration:     string;
    imputePercentile: number;
    bias:             Record<string, number>;
  };
  servers: ServerData[];
}
