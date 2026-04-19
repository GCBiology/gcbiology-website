import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const puzzleLatency = new Trend("puzzle_latency", true);

const SUPABASE_URL =
  "https://fzeerogaurizcafngnjg.supabase.co/functions/v1/daily-puzzle";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZWVyb2dhdXJpemNhZm5nbmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDQ3MDYsImV4cCI6MjA5MjEyMDcwNn0.tqufRPYmV_mp9YBW2QG3kp-a2zRG61OMWRHLt2thWEQ";

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // warm up
    { duration: "60s", target: 50 },   // ramp
    { duration: "60s", target: 200 },  // stress
    { duration: "30s", target: 0 },    // cool down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"],  // 95% under 2s
    errors: ["rate<0.01"],             // <1% error rate
  },
};

const params = {
  headers: {
    Authorization: `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
  },
};

export default function () {
  const start = Date.now();
  const res = http.get(SUPABASE_URL, params);
  const duration = Date.now() - start;

  puzzleLatency.add(duration);

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has terms": (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.terms) && body.terms.length > 0;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!ok);
  sleep(1);
}
