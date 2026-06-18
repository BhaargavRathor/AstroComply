const API_BASE = process.env.NEXT_PUBLIC_MOSIP_API_BASE ?? "https://mosip-backend-k55f.onrender.com";

type FetchOptions = RequestInit & {
  timeoutMs?: number;
};

async function requestJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `MOSIP API returned ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export type AssessmentSection = Record<string, unknown>;

export type AssessmentPayload = {
  satellite?: AssessmentSection;
  orbital_analysis?: AssessmentSection;
  collision_analysis?: AssessmentSection;
  compliance_analysis?: AssessmentSection;
  sustainability_analysis?: AssessmentSection;
  forecast?: AssessmentSection;
  mitigation_analysis?: AssessmentSection;
  recommendations?: AssessmentSection[];
  report?: string;
  agent_timeline?: AssessmentSection[];
  regulations?: RegulationSearchResult[];
  regulations_used?: number;
  status?: string;
  errors?: string[];
};

export type SatelliteSummary = {
  norad_id: number;
  object_name: string;
  object_id?: string | null;
  inclination?: number | null;
  mean_motion?: number | null;
  altitude_km?: number | null;
  orbit_type?: string | null;
  risk_score?: number | null;
  risk_level?: string | null;
};

export type SatelliteListPayload = {
  total_returned: number;
  limit: number;
  offset: number;
  orbit_filter?: string | null;
  satellites: SatelliteSummary[];
};

export type SatelliteSearchPayload = {
  query: string;
  count: number;
  results: SatelliteSummary[];
};

export type MetricsSummaryPayload = {
  total_satellites?: number;
  orbit_distribution?: Record<string, number>;
  risk_distribution?: Record<string, number>;
  average_risk_score?: number;
  critical_risk_count?: number;
  altitude_stats?: {
    min_km?: number | null;
    max_km?: number | null;
    avg_km?: number | null;
  };
};

export type HealthPayload = {
  status: string;
  version?: string;
  platform?: string;
  databases?: {
    postgresql?: string;
    qdrant?: string;
  };
  llm?: {
    provider?: string;
    model?: string;
    status?: string;
  };
};

export type RegulationSearchResult = {
  score?: number;
  source?: string;
  document?: string;
  text?: string;
};

export type RegulationAnswerPayload = {
  query: string;
  answer: string;
  results: RegulationSearchResult[];
  status?: string;
  error?: string;
};

export type RawMissionPayload = {
  altitude_km: number;
  inclination: number;
  debris_density: number;
  conjunction_frequency: number;
  eccentricity: number;
};

export async function assessNorad(noradId: string) {
  return requestJson<AssessmentPayload>(`/assess/${encodeURIComponent(noradId)}`, {
    timeoutMs: 45000,
  });
}

export async function listSatellites(limit = 50, offset = 0) {
  return requestJson<SatelliteListPayload>(
    `/satellites/?limit=${limit}&offset=${offset}`,
    { timeoutMs: 15000 },
  );
}

export async function searchSatellites(query: string, limit = 25) {
  return requestJson<SatelliteSearchPayload>(
    `/satellites/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { timeoutMs: 15000 },
  );
}

export async function getMetricsSummary() {
  return requestJson<MetricsSummaryPayload>("/metrics/summary", { timeoutMs: 15000 });
}

export async function getHealth() {
  return requestJson<HealthPayload>("/health", { timeoutMs: 15000 });
}

export async function assessRaw(payload: RawMissionPayload) {
  return requestJson<AssessmentPayload>("/assess/raw", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 45000,
  });
}

export async function searchRegulations(query: string) {
  return requestJson<{ query: string; results: RegulationSearchResult[]; error?: string }>(
    `/regulations/search?q=${encodeURIComponent(query)}&limit=10`,
    { timeoutMs: 15000 },
  );
}

export async function askRegulation(query: string, limit = 5) {
  return requestJson<RegulationAnswerPayload>(
    `/regulations/ask?q=${encodeURIComponent(query)}&limit=${limit}`,
    { timeoutMs: 45000 },
  );
}

// ── UiPath Orchestration API helpers ──────────────────────────────────────────

export type UiPathJobSubmitRequest = {
  operator_id: string;
  object_name: string;
  altitude_km?: number;
  inclination?: number;
  eccentricity?: number;
  raan?: number;
  arg_of_perigee?: number;
  mean_motion?: number;
  debris_density?: number;
  conjunction_frequency?: number;
  risk_threshold?: number;
};

export type UiPathJobStatusPayload = {
  job_id: string;
  operator_id: string;
  object_name: string;
  status: "PENDING" | "RUNNING" | "ACTION_CENTER" | "APPROVED" | "ESCALATED" | "FAILED";
  risk_score: number | null;
  risk_level: string | null;
  violations: string[] | null;
  failed_requirements: string[] | null;
  passed_requirements: string[] | null;
  report: string | null;
  created_at: string;
  updated_at: string;
  sla_expires_at: string | null;
  risk_threshold: number;
  result: Record<string, any> | null;
  errors: string[];
  escalation_reason: string | null;
  raw_params: Record<string, any>;
};

export type SapFeePayload = {
  operator_id: string;
  status: "PAID" | "UNPAID";
  balance: number;
  fee_amount: number;
  payment_verified: boolean;
};

export type RegisterAssetRequest = {
  job_id: string;
  operator_id: string;
  object_name: string;
  orbit_type: string;
  altitude_km: number;
};

export type RegisterAssetPayload = {
  status: "SUCCESS" | "FAILED";
  registration_id: string;
  registered_at: string;
  asset_details: RegisterAssetRequest;
};

export type EscalatePayload = {
  status: "ESCALATED";
  job_id: string;
  maneuvers_executed: boolean;
  maneuver_details: string[];
  updated_at: string;
};

export async function submitUiPathJob(payload: UiPathJobSubmitRequest) {
  return requestJson<{ job_id: string; status: string; message: string; created_at: string }>(
    "/uipath/job/submit",
    {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    }
  );
}

export async function getUiPathJobStatus(jobId: string) {
  return requestJson<UiPathJobStatusPayload>(`/uipath/job/status/${encodeURIComponent(jobId)}`, {
    timeoutMs: 15000,
  });
}

export async function approveUiPathJob(jobId: string) {
  return requestJson<{ status: string; job_id: string; message: string; updated_at: string }>(
    `/uipath/job/approve/${encodeURIComponent(jobId)}`,
    {
      method: "POST",
      timeoutMs: 15000,
    }
  );
}

export async function checkUiPathSapFee(operatorId: string) {
  return requestJson<SapFeePayload>(`/uipath/sap/check-fee/${encodeURIComponent(operatorId)}`, {
    timeoutMs: 15000,
  });
}

export async function registerUiPathAsset(payload: RegisterAssetRequest) {
  return requestJson<RegisterAssetPayload>("/uipath/sap/register-asset", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 15000,
  });
}

export async function escalateUiPathJob(jobId: string, reason = "SLA Breach / Unresolved Risk") {
  return requestJson<EscalatePayload>("/uipath/escalate", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId, reason }),
    timeoutMs: 15000,
  });
}
