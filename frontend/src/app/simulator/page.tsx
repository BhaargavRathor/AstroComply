"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sliders, Gauge, RotateCcw, Zap, AlertTriangle, ShieldCheck, 
  FileText, DollarSign, User, Clock, ArrowRight, UploadCloud, 
  CheckCircle2, Activity, Play, ShieldAlert, Cpu
} from "lucide-react";
import {
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid,
} from "recharts";
import { 
  assessRaw, 
  submitUiPathJob, 
  getUiPathJobStatus, 
  approveUiPathJob, 
  checkUiPathSapFee, 
  registerUiPathAsset, 
  escalateUiPathJob,
  type AssessmentPayload,
  type UiPathJobStatusPayload
} from "@/utils/api";

type SimulationResults = {
  riskScore: number;
  burden: number;
  sustainability: number;
  grade: string;
  status: string;
  violations: string[];
  velocity: number;
  apogee: number;
  perigee: number;
  period: number;
  regime: string;
  forecast: { name: string; risk: number }[];
  chartData: { name: string; score: number }[];
  feedback: string[];
};

function riskColor(score: number) {
  if (score >= 70) return "#ff3366";
  if (score >= 50) return "#ffb700";
  return "#00ff9d";
}

function valueFrom(section: Record<string, unknown> | undefined, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = Number(section?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function textFrom(section: Record<string, unknown> | undefined, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = section?.[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function resultsFromAssessment(assessment: any): SimulationResults {
  const riskScore = Math.round(valueFrom(assessment.collision_analysis, ["risk_score"]));
  const burden = Math.round(valueFrom(assessment.sustainability_analysis, ["orbital_burden_score", "environmental_burden"]));
  const sustainability = Math.round(valueFrom(assessment.sustainability_analysis, ["sustainability_index"]));
  const projections = assessment.forecast?.projections as Record<string, Record<string, unknown>> | undefined;
  const feedback = [
    textFrom(assessment.collision_analysis, ["summary"], ""),
    textFrom(assessment.compliance_analysis, ["reasoning", "compliance_summary"], ""),
    textFrom(assessment.sustainability_analysis, ["narrative"], ""),
  ].filter(Boolean);

  return {
    riskScore,
    burden,
    sustainability,
    grade: textFrom(assessment.compliance_analysis, ["compliance_grade"], "N/A"),
    status: textFrom(assessment.compliance_analysis, ["status", "compliance_level"], "UNKNOWN"),
    violations: Array.isArray(assessment.compliance_analysis?.violations) ? assessment.compliance_analysis.violations.map(String) : [],
    velocity: valueFrom(assessment.orbital_analysis, ["velocity"]),
    apogee: Math.round(valueFrom(assessment.orbital_analysis, ["apogee"])),
    perigee: Math.round(valueFrom(assessment.orbital_analysis, ["perigee"])),
    period: Math.round(valueFrom(assessment.orbital_analysis, ["period_min"])),
    regime: textFrom(assessment.orbital_analysis, ["regime", "orbit_type"], "UNKNOWN"),
    forecast: [
      { name: "Now", risk: riskScore },
      { name: "5Y", risk: Math.round(Number(projections?.["5yr"]?.projected_risk_score) || 0) },
      { name: "10Y", risk: Math.round(Number(projections?.["10yr"]?.projected_risk_score) || 0) },
      { name: "25Y", risk: Math.round(Number(projections?.["25yr"]?.projected_risk_score) || 0) },
    ],
    chartData: [
      { name: "Collision Risk", score: riskScore },
      { name: "Eco Burden", score: burden },
      { name: "Sustainability", score: sustainability },
    ],
    feedback: feedback.length ? feedback : ["No backend narrative returned."],
  };
}

export default function SimulatorPage() {
  const [activeTab, setActiveTab] = useState<"sandbox" | "uipath">("uipath");

  // --- Tab 1: Virtual Flight Simulator (Sandbox) ---
  const [altitude, setAltitude] = useState(650);
  const [inclination, setInclination] = useState(55.2);
  const [eccentricity, setEccentricity] = useState(0.001);
  const [debrisDensity, setDebrisDensity] = useState(12.4);
  const [conjunctions, setConjunctions] = useState(3.5);
  const [simulating, setSimulating] = useState(false);
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // --- Tab 2: UiPath Orchestrator Simulation ---
  const [operatorId, setOperatorId] = useState("operator_spacex_88");
  const [objectName, setObjectName] = useState("Starlink-V2-Sim");
  const [uipathAltitude, setUipathAltitude] = useState(720);
  const [uipathInclination, setUipathInclination] = useState(53.0);
  const [uipathEccentricity, setUipathEccentricity] = useState(0.0005);
  const [uipathDebrisDensity, setUipathDebrisDensity] = useState(15.2);
  const [uipathConjunctions, setUipathConjunctions] = useState(4.8);
  const [uipathRiskThreshold, setUipathRiskThreshold] = useState(50.0);

  // Simulation process flow tracking
  const [uiSimStatus, setUiSimStatus] = useState<"idle" | "ingesting" | "sap_check" | "running_audit" | "action_center" | "approved" | "registering" | "escalated" | "completed" | "failed">("idle");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [sapResult, setSapResult] = useState<any | null>(null);
  const [jobDetails, setJobDetails] = useState<UiPathJobStatusPayload | null>(null);
  const [registryDetails, setRegistryDetails] = useState<any | null>(null);
  const [uipathLogs, setUipathLogs] = useState<string[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [uipathError, setUipathError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [pdfExtracting, setPdfExtracting] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const slaTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Add a log entry helper
  const addLog = (msg: string) => {
    setUipathLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (slaTimerRef.current) clearInterval(slaTimerRef.current);
    };
  }, []);

  // SLA Countdown Timer Effect
  useEffect(() => {
    if (uiSimStatus === "action_center" && secondsRemaining > 0) {
      slaTimerRef.current = setTimeout(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            handleSlaTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (slaTimerRef.current) {
        clearTimeout(slaTimerRef.current);
      }
    }
    return () => {
      if (slaTimerRef.current) clearTimeout(slaTimerRef.current);
    };
  }, [uiSimStatus, secondsRemaining]);

  // Handle SLA timeout automatically
  const handleSlaTimeout = async () => {
    if (!currentJobId) return;
    addLog("⚠️ SLA DEADLINE BREACHED! Auto-escalating to Emergency Thruster Avoidance Protocol...");
    try {
      const esc = await escalateUiPathJob(currentJobId, "SLA Timeout (15 minutes breached in Action Center)");
      setUiSimStatus("escalated");
      addLog(`🔥 EMERGENCY: Escalation state active. Maneuvers initiated:`);
      esc.maneuver_details.forEach(detail => addLog(`   └ ${detail}`));
      
      // Update job details to show Escalated
      const updated = await getUiPathJobStatus(currentJobId);
      setJobDetails(updated);
    } catch (err: any) {
      addLog(`❌ Escalation API error: ${err.message}`);
    }
  };

  // Run direct sandbox simulation
  const runSandboxSim = async () => {
    setSimulating(true);
    setResults(null);
    setSandboxError(null);
    try {
      const assessment = await assessRaw({
        altitude_km: altitude,
        inclination,
        eccentricity,
        debris_density: debrisDensity,
        conjunction_frequency: conjunctions,
      });
      if (assessment.errors?.length) throw new Error(assessment.errors[0]);
      setResults(resultsFromAssessment(assessment));
    } catch (err: unknown) {
      setSandboxError(err instanceof Error ? err.message : "Raw assessment failed.");
    } finally {
      setSimulating(false);
    }
  };

  // Reset sandbox parameters
  const resetSandbox = () => {
    setAltitude(650); setInclination(55.2); setEccentricity(0.001);
    setDebrisDensity(12.4); setConjunctions(3.5); setResults(null); setSandboxError(null);
  };

  // Mock proposal PDF upload
  const handlePdfUpload = (type: "compliant" | "delinquent" | "risky") => {
    setPdfExtracting(true);
    setSelectedFile(`launch_proposal_${type}.pdf`);
    addLog(`📄 Uploaded launch_proposal_${type}.pdf to UiPath Document Understanding`);
    
    setTimeout(() => {
      setPdfExtracting(false);
      if (type === "compliant") {
        setOperatorId("operator_spacex_88");
        setObjectName("Starlink-Mini-4");
        setUipathAltitude(550);
        setUipathInclination(53.0);
        setUipathEccentricity(0.0002);
        setUipathDebrisDensity(6.4);
        setUipathConjunctions(1.2);
        setUipathRiskThreshold(50.0);
        addLog("✅ Document Understanding: Extracted parameters (Low Risk satellite, SpaceX)");
      } else if (type === "delinquent") {
        setOperatorId("operator_orbitaltech_unpaid");
        setObjectName("OrbitalGlobe-Beta");
        setUipathAltitude(680);
        setUipathInclination(74.0);
        setUipathEccentricity(0.0012);
        setUipathDebrisDensity(14.5);
        setUipathConjunctions(3.2);
        setUipathRiskThreshold(45.0);
        addLog("✅ Document Understanding: Extracted parameters (Delinquent operator, moderate metrics)");
      } else {
        setOperatorId("operator_oneweb_42");
        setObjectName("OneWeb-HighRisk-V2");
        setUipathAltitude(850);
        setUipathInclination(86.4);
        setUipathEccentricity(0.0025);
        setUipathDebrisDensity(25.4);
        setUipathConjunctions(9.8);
        setUipathRiskThreshold(45.0);
        addLog("✅ Document Understanding: Extracted parameters (High Risk parameters, OneWeb)");
      }
    }, 1500);
  };

  // Run the full UiPath Simulated Workflow
  const runUiPathSimulation = async () => {
    setUipathError(null);
    setUipathLogs([]);
    setSapResult(null);
    setJobDetails(null);
    setRegistryDetails(null);
    
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (slaTimerRef.current) clearTimeout(slaTimerRef.current);

    try {
      // 1. PDF Ingestion Phase
      setUiSimStatus("ingesting");
      addLog("🤖 [Step 1/6] Ingesting proposal document via UiPath Document Understanding...");
      await new Promise(resolve => setTimeout(resolve, 1500));
      addLog(`   └ Ingestion complete. Operator: ${operatorId} | Asset: ${objectName}`);

      // 2. SAP Billing Check Phase
      setUiSimStatus("sap_check");
      addLog("🤖 [Step 2/6] Verifying operator licensing fee status via mock SAP billing API...");
      const sapRes = await checkUiPathSapFee(operatorId);
      setSapResult(sapRes);
      await new Promise(resolve => setTimeout(resolve, 1200));

      if (!sapRes.payment_verified) {
        addLog(`❌ Verification failed! Outstanding license balance: $${sapRes.balance} USD.`);
        addLog("⛔ Orchestrator: Workflow suspended due to payment delinquency.");
        setUiSimStatus("failed");
        return;
      }
      addLog("✅ Verification successful. Operator account in good standing. Fee paid.");

      // 3. FastAPI Background Multi-Agent Audit Submission
      setUiSimStatus("running_audit");
      addLog("🤖 [Step 3/6] Dispatching FastAPI Multi-Agent Orbital Sustainability Audit...");
      const submitRes = await submitUiPathJob({
        operator_id: operatorId,
        object_name: objectName,
        altitude_km: uipathAltitude,
        inclination: uipathInclination,
        eccentricity: uipathEccentricity,
        debris_density: uipathDebrisDensity,
        conjunction_frequency: uipathConjunctions,
        risk_threshold: uipathRiskThreshold,
      });

      const jobId = submitRes.job_id;
      setCurrentJobId(jobId);
      addLog(`✅ Job submitted successfully. Job ID: ${jobId}`);
      addLog("⏳ Polling LangGraph agents: Supervisor -> Orbital -> Collision -> Compliance...");

      // Start polling status
      let pollCount = 0;
      pollIntervalRef.current = setInterval(async () => {
        pollCount++;
        try {
          const statusRes = await getUiPathJobStatus(jobId);
          setJobDetails(statusRes);
          
          if (statusRes.status === "RUNNING") {
            addLog(`   └ [Polled ${pollCount}] LangGraph executing audit steps...`);
          } else if (statusRes.status === "ACTION_CENTER") {
            clearInterval(pollIntervalRef.current!);
            setUiSimStatus("action_center");
            setSecondsRemaining(15 * 60); // 15-minute SLA
            addLog("⚠️ [Step 4/6] HIGH RISK / VIOLATIONS DETECTED! Job held for human evaluation.");
            addLog("📋 Created task in UiPath Action Center. 15-minute SLA countdown activated.");
          } else if (statusRes.status === "APPROVED") {
            clearInterval(pollIntervalRef.current!);
            setUiSimStatus("approved");
            addLog("✅ [Step 4/6] Audit passed automatically. Job approved. Proceeding to asset registration.");
            // Trigger auto-registration
            triggerRpaAssetRegistration(jobId, statusRes);
          } else if (statusRes.status === "FAILED") {
            clearInterval(pollIntervalRef.current!);
            setUiSimStatus("failed");
            addLog(`❌ Audit execution failed: ${statusRes.errors.join(", ")}`);
          }
        } catch (err: any) {
          clearInterval(pollIntervalRef.current!);
          setUiSimStatus("failed");
          addLog(`❌ Error polling job status: ${err.message}`);
        }
      }, 2000);

    } catch (err: any) {
      setUiSimStatus("failed");
      setUipathError(err.message || "UiPath simulation failed.");
      addLog(`❌ Simulation crashed: ${err.message}`);
    }
  };

  // Step 5: RPA Bot Registration
  const triggerRpaAssetRegistration = async (jobId: string, currentJob: UiPathJobStatusPayload) => {
    setUiSimStatus("registering");
    addLog("🤖 [Step 5/6] Triggering UiPath RPA bot to register satellite asset in international registry...");
    try {
      const regRes = await registerUiPathAsset({
        job_id: jobId,
        operator_id: currentJob.operator_id,
        object_name: currentJob.object_name,
        orbit_type: currentJob.result?.orbital_analysis?.orbit_type || "LEO",
        altitude_km: currentJob.raw_params.altitude_km || 600
      });
      setRegistryDetails(regRes);
      await new Promise(resolve => setTimeout(resolve, 1500));
      addLog(`✅ Registration Successful! Assigned Registry ID: ${regRes.registration_id}`);
      
      // Step 6: Complete
      setUiSimStatus("completed");
      addLog("🎉 [Step 6/6] UiPath Orchestration Workflow finished successfully! Mission licensed.");
    } catch (err: any) {
      setUiSimStatus("failed");
      addLog(`❌ RPA Asset Registration failed: ${err.message}`);
    }
  };

  // Manual Inspector Approval from Action Center
  const handleActionCenterApprove = async () => {
    if (!currentJobId || !jobDetails) return;
    addLog("👤 Inspector clicked 'APPROVE' in Action Center. Resuming workflow...");
    try {
      await approveUiPathJob(currentJobId);
      setUiSimStatus("approved");
      addLog("✅ Action Center Task Resolved: Approved.");
      triggerRpaAssetRegistration(currentJobId, jobDetails);
    } catch (err: any) {
      addLog(`❌ Approval API error: ${err.message}`);
    }
  };

  // Manual Inspector Escalation from Action Center
  const handleActionCenterEscalate = async () => {
    if (!currentJobId) return;
    addLog("👤 Inspector clicked 'ESCALATE' (Force Override).");
    try {
      const esc = await escalateUiPathJob(currentJobId, "Force Override by Human Inspector");
      setUiSimStatus("escalated");
      addLog(`🔥 ESCALATION ACTIVE. maneuvers initiated:`);
      esc.maneuver_details.forEach(detail => addLog(`   └ ${detail}`));

      // Update job details to show Escalated
      const updated = await getUiPathJobStatus(currentJobId);
      setJobDetails(updated);
    } catch (err: any) {
      addLog(`❌ Escalation API error: ${err.message}`);
    }
  };

  // Format SLA time remaining
  const formatSlaTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const sliders = [
    { label: "Mean Altitude", value: altitude, set: setAltitude, min: 200, max: 2500, step: 10, unit: "km", decimals: 0 },
    { label: "Orbit Inclination", value: inclination, set: setInclination, min: 0, max: 180, step: 0.1, unit: "°", decimals: 1 },
    { label: "Eccentricity", value: eccentricity, set: setEccentricity, min: 0, max: 0.05, step: 0.0001, unit: "", decimals: 4 },
    { label: "Debris Density", value: debrisDensity, set: setDebrisDensity, min: 0, max: 30, step: 0.1, unit: "obj/km³", decimals: 1 },
    { label: "Conjunction Events", value: conjunctions, set: setConjunctions, min: 0, max: 20, step: 0.1, unit: "/week", decimals: 1 },
  ];

  return (
    <div className="min-h-[calc(100vh-var(--topbar-h))] cyber-grid p-5 lg:p-7">
      
      {/* ── Header tab switcher ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 border-b border-white/[0.06] pb-4">
        <div>
          <span className="eyebrow block mb-1">AstroComply AI Licensing Engine</span>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Cpu className="text-[#00d4ff] h-6 w-6" /> Mission Simulator Dashboard
          </h1>
        </div>
        <div className="flex bg-[#0c0c16] border border-white/[0.08] p-1 rounded-lg mt-3 md:mt-0">
          <button 
            onClick={() => setActiveTab("uipath")} 
            className={`px-4 py-2 font-digital text-xs uppercase tracking-wider rounded-md transition-all duration-200 ${activeTab === "uipath" ? "bg-[#00d4ff] text-black font-bold shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            UiPath Orchestration
          </button>
          <button 
            onClick={() => setActiveTab("sandbox")} 
            className={`px-4 py-2 font-digital text-xs uppercase tracking-wider rounded-md transition-all duration-200 ${activeTab === "sandbox" ? "bg-[#00d4ff] text-black font-bold shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            Sandbox Model Modeler
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── TAB 1: SANDBOX MODELER ─────────────────────────────────────── */}
        {activeTab === "sandbox" && (
          <motion.div
            key="sandbox-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-5"
          >
            {/* Left sliders */}
            <div className="xl:col-span-4">
              <div className="cyber-panel p-5 flex flex-col gap-5 sticky top-20">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
                  <div>
                    <span className="eyebrow block mb-1">Flight Parameters</span>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Orbital Config</h2>
                  </div>
                  <Sliders size={18} className="text-[#00d4ff]/40" />
                </div>

                <div className="flex flex-col gap-5">
                  {sliders.map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-digital text-[10px] uppercase tracking-wider text-slate-400">{s.label}</span>
                        <span className="font-digital text-xs font-bold text-[#00d4ff]">
                          {s.decimals === 4 ? s.value.toFixed(4) : s.decimals === 1 ? s.value.toFixed(1) : s.value}
                          {s.unit && <span className="text-slate-500 font-normal ml-0.5">{s.unit}</span>}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min={s.min}
                          max={s.max}
                          step={s.step}
                          value={s.value}
                          onChange={(e) => s.set(parseFloat(e.target.value))}
                          className="w-full h-1 rounded-full outline-none"
                          style={{
                            background: `linear-gradient(to right, #00d4ff ${((s.value - s.min) / (s.max - s.min)) * 100}%, rgba(255,255,255,0.06) 0%)`,
                            accentColor: "#00d4ff",
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="font-digital text-[8px] text-slate-600">{s.min}{s.unit}</span>
                        <span className="font-digital text-[8px] text-slate-600">{s.max}{s.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2 border-t border-white/[0.05]">
                  <button onClick={resetSandbox} className="btn-ghost flex items-center gap-1.5 rounded-lg px-4 py-2 font-digital text-[10px] uppercase tracking-wider">
                    <RotateCcw size={11} /> Reset
                  </button>
                  <motion.button
                    onClick={runSandboxSim}
                    disabled={simulating}
                    whileTap={{ scale: 0.96, y: 2 }}
                    className="cta-glow flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 font-digital text-xs uppercase tracking-[0.2em] disabled:opacity-50"
                    style={{ boxShadow: simulating ? "none" : "0 4px 0 rgba(0,212,255,0.15), 0 0 20px rgba(0,212,255,0.1)" }}
                  >
                    {simulating ? <Gauge size={14} className="animate-pulse" /> : <Zap size={14} />}
                    {simulating ? "Computing..." : "Run Simulation"}
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Right results */}
            <div className="xl:col-span-8">
              <AnimatePresence mode="wait">
                {!results && !simulating && (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="cyber-panel flex min-h-[500px] flex-col items-center justify-center gap-4"
                  >
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                      <Sliders size={30} className="text-slate-600" />
                    </div>
                    <div className="text-center">
                      <p className="font-digital text-xs uppercase tracking-[0.3em] text-slate-500">Simulator Idle</p>
                      <p className="text-sm text-slate-600 mt-1">Configure parameters and run simulation</p>
                    </div>
                  </motion.div>
                )}

                {simulating && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="cyber-panel flex min-h-[500px] flex-col items-center justify-center gap-5"
                  >
                    <div className="relative">
                      <Gauge size={48} className="text-[#00d4ff] animate-pulse" />
                      <div className="absolute inset-0 rounded-full" style={{ boxShadow: "0 0 30px rgba(0,212,255,0.2)" }} />
                    </div>
                    <p className="font-digital text-xs uppercase tracking-[0.3em] text-[#00d4ff]">Propagating Orbital Envelope</p>
                    <div className="w-64 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-[#00d4ff]/70 rounded-full"
                        initial={{ width: "0%" }}
                        animate={{ width: "90%" }}
                        transition={{ duration: 1.3, ease: "easeOut" }}
                      />
                    </div>
                  </motion.div>
                )}

                {results && !simulating && (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-5"
                  >
                    {/* Metric Cards Row */}
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: "Collision Risk", value: results.riskScore, unit: "%", color: riskColor(results.riskScore) },
                        { label: "Eco Burden", value: results.burden, unit: "%", color: "#00d4ff" },
                        { label: "Sustainability", value: results.sustainability, unit: "/100", color: "#00ff9d" },
                      ].map((card, i) => (
                        <motion.div
                          key={card.label}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="cyber-panel p-4 text-center"
                          style={{ borderColor: `${card.color}18` }}
                        >
                          <span className="eyebrow block mb-2">{card.label}</span>
                          <span className="font-digital text-3xl font-bold" style={{ color: card.color }}>
                            {card.value}
                            <span className="text-sm font-normal text-slate-500 ml-1">{card.unit}</span>
                          </span>
                        </motion.div>
                      ))}
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Risk Donut */}
                      <div className="cyber-panel p-5">
                        <span className="eyebrow block mb-3">Risk Score (Radial)</span>
                        <div className="h-[160px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="95%" data={[{ value: results.riskScore }]} startAngle={90} endAngle={-270}>
                              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                              <RadialBar dataKey="value" cornerRadius={6} fill={riskColor(results.riskScore)} background={{ fill: "rgba(255,255,255,0.04)" }} />
                            </RadialBarChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="font-digital text-center text-xs text-slate-500 -mt-3">{results.riskScore}% — {results.status}</p>
                      </div>

                      {/* Bar Chart */}
                      <div className="cyber-panel p-5">
                        <span className="eyebrow block mb-3">Orbital Metrics</span>
                        <div className="h-[160px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={results.chartData} barSize={18}>
                              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 8, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: "#475569", fontSize: 8, fontFamily: "monospace" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                              <Tooltip contentStyle={{ backgroundColor: "#080810", borderColor: "rgba(0,212,255,0.15)", color: "#fff", fontSize: "10px", fontFamily: "monospace" }} />
                              <Bar dataKey="score" fill="#00d4ff" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* Forecast Line Chart */}
                    <div className="cyber-panel p-5">
                      <span className="eyebrow block mb-3">25-Year Risk Forecast</span>
                      <div className="h-[140px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={results.forecast}>
                            <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: "#080810", borderColor: "rgba(0,212,255,0.15)", color: "#fff", fontSize: "10px", fontFamily: "monospace" }} />
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <Line type="monotone" dataKey="risk" stroke={riskColor(results.riskScore)} strokeWidth={2} dot={{ r: 4, fill: riskColor(results.riskScore) }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Compliance Grade + Feedback */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="cyber-panel p-5 flex flex-col items-center justify-center gap-3">
                        <span className="eyebrow block">Compliance Grade</span>
                        <div
                          className="flex h-20 w-20 items-center justify-center rounded-full border-2 animate-border-glow animate-pulse"
                          style={{ borderColor: results.riskScore >= 70 ? "#ff3366" : results.riskScore >= 50 ? "#ffb700" : "#00ff9d" }}
                        >
                          <span className="font-digital text-3xl font-bold" style={{ color: results.riskScore >= 70 ? "#ff3366" : results.riskScore >= 50 ? "#ffb700" : "#00ff9d" }}>
                            {results.grade}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {results.violations.length === 0 ? (
                            <ShieldCheck size={13} className="text-[#00ff9d]" />
                          ) : (
                            <AlertTriangle size={13} className="text-[#ffb700]" />
                          )}
                          <span className="font-digital text-[9px] uppercase tracking-wider" style={{ color: results.riskScore >= 70 ? "#ff3366" : results.riskScore >= 50 ? "#ffb700" : "#00ff9d" }}>
                            {results.status}
                          </span>
                        </div>
                      </div>

                      <div className={`cyber-panel p-4 overflow-y-auto max-h-[200px] ${results.violations.length > 0 ? "cyber-panel-danger" : ""}`}>
                        <span className="eyebrow block mb-3">Intelligence Feedback</span>
                        <div className="flex flex-col gap-2">
                          {results.feedback.map((f, i) => (
                            <p key={i} className={`font-digital text-[9px] leading-relaxed ${f.startsWith("✓") ? "text-[#00ff9d]" : "text-[#ffb700]"}`}>
                              {f}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── TAB 2: UIPATH ORCHESTRATION WORKFLOW ────────────────────────── */}
        {activeTab === "uipath" && (
          <motion.div
            key="uipath-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-5"
          >
            {/* Left: Configuration & Document DU Ingestion */}
            <div className="xl:col-span-4 flex flex-col gap-5">
              
              {/* Document DU Ingestion Panel */}
              <div className="cyber-panel p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
                  <div>
                    <span className="eyebrow block mb-1">Step 1: Document DU Ingestion</span>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Proposal Ingest</h2>
                  </div>
                  <UploadCloud size={18} className="text-[#00d4ff]/60" />
                </div>

                <div className="border border-dashed border-white/[0.1] rounded-lg p-5 text-center flex flex-col items-center justify-center bg-white/[0.01] hover:bg-white/[0.02] transition-colors relative overflow-hidden group">
                  {pdfExtracting ? (
                    <div className="flex flex-col items-center py-4">
                      <Activity className="animate-spin text-[#00d4ff] h-8 w-8 mb-2" />
                      <p className="font-digital text-[10px] text-slate-400 uppercase tracking-widest">DU Extracting PDF...</p>
                    </div>
                  ) : (
                    <>
                      <FileText className="text-slate-500 h-10 w-10 mb-2 group-hover:text-[#00d4ff] transition-colors" />
                      <p className="font-digital text-[10px] text-slate-400 uppercase tracking-wider mb-1">Ingest Launch Proposal PDF</p>
                      <p className="text-[9px] text-slate-600 mb-3 font-mono">Select simulated payload</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button 
                          onClick={() => handlePdfUpload("compliant")} 
                          className="bg-[#00ff9d]/10 hover:bg-[#00ff9d]/25 border border-[#00ff9d]/30 text-[#00ff9d] rounded px-2.5 py-1 font-digital text-[8px] uppercase tracking-wider"
                        >
                          Low Risk (Starlink)
                        </button>
                        <button 
                          onClick={() => handlePdfUpload("risky")} 
                          className="bg-[#ffb700]/10 hover:bg-[#ffb700]/25 border border-[#ffb700]/30 text-[#ffb700] rounded px-2.5 py-1 font-digital text-[8px] uppercase tracking-wider"
                        >
                          High Risk (OneWeb)
                        </button>
                        <button 
                          onClick={() => handlePdfUpload("delinquent")} 
                          className="bg-[#ff3366]/10 hover:bg-[#ff3366]/25 border border-[#ff3366]/30 text-[#ff3366] rounded px-2.5 py-1 font-digital text-[8px] uppercase tracking-wider"
                        >
                          Delinquent Billing
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {selectedFile && (
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded p-2.5">
                    <FileText size={14} className="text-[#00d4ff]" />
                    <span className="font-mono text-[9px] text-slate-400 truncate flex-1">{selectedFile}</span>
                    <span className="font-digital text-[8px] bg-slate-800 text-[#00ff9d] px-1.5 py-0.5 rounded">LOADED</span>
                  </div>
                )}
              </div>

              {/* Param Form Panel */}
              <div className="cyber-panel p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
                  <div>
                    <span className="eyebrow block mb-1">Simulation Payload</span>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Extracted Data</h2>
                  </div>
                  <Sliders size={18} className="text-[#00d4ff]/40" />
                </div>

                <div className="flex flex-col gap-3 font-mono text-[10px]">
                  {/* Operator ID */}
                  <div>
                    <label className="block text-slate-500 mb-1">OPERATOR ID (SAP billing check)</label>
                    <div className="relative">
                      <User className="absolute left-2.5 top-2.5 h-3 w-3 text-slate-500" />
                      <input 
                        type="text" 
                        value={operatorId}
                        onChange={(e) => setOperatorId(e.target.value)}
                        className="w-full bg-[#0a0a14] border border-white/[0.08] rounded px-3 py-2 pl-8 text-white focus:outline-none focus:border-[#00d4ff]"
                      />
                    </div>
                  </div>

                  {/* Satellite Name */}
                  <div>
                    <label className="block text-slate-500 mb-1">SATELLITE/OBJECT NAME</label>
                    <input 
                      type="text" 
                      value={objectName}
                      onChange={(e) => setObjectName(e.target.value)}
                      className="w-full bg-[#0a0a14] border border-white/[0.08] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00d4ff]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 mb-1">ALTITUDE (KM)</label>
                      <input 
                        type="number" 
                        value={uipathAltitude}
                        onChange={(e) => setUipathAltitude(Number(e.target.value))}
                        className="w-full bg-[#0a0a14] border border-white/[0.08] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00d4ff]"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1">INCLINATION (°)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={uipathInclination}
                        onChange={(e) => setUipathInclination(Number(e.target.value))}
                        className="w-full bg-[#0a0a14] border border-white/[0.08] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00d4ff]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 mb-1">DEBRIS DENSITY</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={uipathDebrisDensity}
                        onChange={(e) => setUipathDebrisDensity(Number(e.target.value))}
                        className="w-full bg-[#0a0a14] border border-white/[0.08] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00d4ff]"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1">CONJUNCTIONS/WK</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={uipathConjunctions}
                        onChange={(e) => setUipathConjunctions(Number(e.target.value))}
                        className="w-full bg-[#0a0a14] border border-white/[0.08] rounded px-3 py-2 text-white focus:outline-none focus:border-[#00d4ff]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1">ORCHESTRATOR RISK THRESHOLD (%)</label>
                    <input 
                      type="range"
                      min="10"
                      max="90"
                      step="5"
                      value={uipathRiskThreshold}
                      onChange={(e) => setUipathRiskThreshold(Number(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded outline-none appearance-none"
                      style={{ accentColor: "#00d4ff" }}
                    />
                    <div className="flex justify-between font-digital text-[8px] text-slate-500 mt-1">
                      <span>10%</span>
                      <span className="text-[#00d4ff] font-bold">Selected: {uipathRiskThreshold}%</span>
                      <span>90%</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/[0.05]">
                  <motion.button
                    onClick={runUiPathSimulation}
                    disabled={uiSimStatus !== "idle" && uiSimStatus !== "completed" && uiSimStatus !== "failed"}
                    whileTap={{ scale: 0.96 }}
                    className="cta-glow w-full flex items-center justify-center gap-2 rounded-lg py-3 font-digital text-xs uppercase tracking-[0.2em] disabled:opacity-50"
                    style={{ boxShadow: "0 4px 0 rgba(0,212,255,0.15), 0 0 20px rgba(0,212,255,0.1)" }}
                  >
                    <Play size={14} /> Start Orchestration
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Right: Simulation Stepper & Interactive Action Center */}
            <div className="xl:col-span-8 flex flex-col gap-5">
              
              {/* Orchestrator Stepper Process Flow */}
              <div className="cyber-panel p-5 flex flex-col gap-4">
                <span className="eyebrow block">UiPath Orchestrator Sim Logs</span>
                
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {[
                    { key: "ingesting", label: "DU Ingestion", status: ["ingesting"] },
                    { key: "sap_check", label: "SAP Billing", status: ["sap_check"] },
                    { key: "running_audit", label: "Agent Audit", status: ["running_audit"] },
                    { key: "action_center", label: "Action Center", status: ["action_center", "escalated"] },
                    { key: "registering", label: "RPA Registry", status: ["registering"] },
                    { key: "completed", label: "Finished", status: ["completed"] }
                  ].map((step, idx) => {
                    const isCurrent = step.status.includes(uiSimStatus);
                    const isDone = 
                      (idx === 0 && !["idle", "ingesting"].includes(uiSimStatus)) ||
                      (idx === 1 && !["idle", "ingesting", "sap_check"].includes(uiSimStatus)) ||
                      (idx === 2 && !["idle", "ingesting", "sap_check", "running_audit"].includes(uiSimStatus)) ||
                      (idx === 3 && ["registering", "completed"].includes(uiSimStatus)) ||
                      (idx === 4 && ["completed"].includes(uiSimStatus)) ||
                      (idx === 5 && uiSimStatus === "completed");

                    const isError = uiSimStatus === "failed" && idx === (
                      uiSimStatus === "failed" ? 
                        (sapResult?.payment_verified === false ? 1 : 2) 
                        : 0
                    );

                    return (
                      <div 
                        key={step.key} 
                        className={`border rounded p-3 text-center flex flex-col items-center justify-center transition-all duration-300 ${isCurrent ? "bg-[#00d4ff]/10 border-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.15)] animate-pulse" : isDone ? "bg-[#00ff9d]/5 border-[#00ff9d]/30" : isError ? "bg-[#ff3366]/10 border-[#ff3366]/40" : "bg-white/[0.01] border-white/[0.05]"}`}
                      >
                        <span className="font-digital text-[8px] text-slate-500 uppercase">Step {idx+1}</span>
                        <span className={`font-digital text-[10px] mt-1.5 uppercase font-bold tracking-wider ${isCurrent ? "text-[#00d4ff]" : isDone ? "text-[#00ff9d]" : isError ? "text-[#ff3366]" : "text-slate-400"}`}>
                          {step.label}
                        </span>
                        <div className="mt-2 text-center">
                          {isDone ? (
                            <CheckCircle2 size={13} className="text-[#00ff9d] inline" />
                          ) : isCurrent ? (
                            <Activity size={13} className="text-[#00d4ff] animate-spin inline" />
                          ) : isError ? (
                            <AlertTriangle size={13} className="text-[#ff3366] inline" />
                          ) : (
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-700 inline-block" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Console Logs Output */}
                <div className="bg-[#05050a] border border-white/[0.05] rounded p-4 h-[180px] overflow-y-auto font-mono text-[9px] text-slate-400 flex flex-col gap-1.5">
                  {uipathLogs.length === 0 ? (
                    <span className="text-slate-600">Simulator console ready. Awaiting trigger...</span>
                  ) : (
                    uipathLogs.map((log, i) => (
                      <div key={i} className={log.includes("❌") || log.includes("🔥") ? "text-[#ff3366]" : log.includes("⚠️") ? "text-[#ffb700]" : log.includes("✅") ? "text-[#00ff9d]" : ""}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Interactive Mock Action Center */}
              <AnimatePresence>
                {(uiSimStatus === "action_center" || uiSimStatus === "escalated") && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`cyber-panel p-5 border-2 ${uiSimStatus === "escalated" ? "border-[#ff3366]/40 bg-[#ff3366]/[0.02]" : "border-[#ffb700]/40 bg-[#ffb700]/[0.02]"}`}
                  >
                    <div className="flex items-start justify-between border-b border-white/[0.05] pb-3 mb-4">
                      <div>
                        <span className="font-digital text-[#ffb700] text-[10px] uppercase tracking-widest font-bold">UiPath Action Center Task Required</span>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Regulatory Waiver Review</h2>
                      </div>
                      <div className="flex items-center gap-1 bg-black/[0.3] border border-white/[0.08] px-3 py-1.5 rounded text-white">
                        <Clock size={12} className="text-[#ffb700]" />
                        <span className="font-digital text-xs text-[#ffb700] tracking-widest font-bold">
                          SLA {formatSlaTime(secondsRemaining)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[10px] mb-5">
                      <div className="flex flex-col gap-2 bg-black/[0.2] border border-white/[0.04] p-3 rounded">
                        <span className="text-slate-500 font-bold uppercase">Satellite Audit Report</span>
                        <div className="flex justify-between">
                          <span>Object Name:</span>
                          <span className="text-white">{jobDetails?.object_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Operator ID:</span>
                          <span className="text-white">{jobDetails?.operator_id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Collision Risk:</span>
                          <span className="text-[#ff3366] font-bold">{jobDetails?.risk_score}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Risk Level:</span>
                          <span className="text-white font-bold">{jobDetails?.risk_level}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Threshold Set:</span>
                          <span className="text-slate-400">{jobDetails?.risk_threshold}%</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 bg-black/[0.2] border border-white/[0.04] p-3 rounded">
                        <span className="text-[#ffb700] font-bold uppercase flex items-center gap-1">
                          <ShieldAlert size={12} /> Compliance Violations
                        </span>
                        {jobDetails?.violations && jobDetails.violations.length > 0 ? (
                          <ul className="list-disc list-inside text-slate-300 flex flex-col gap-1">
                            {jobDetails.violations.map((violation, i) => (
                              <li key={i} className="truncate">{violation}</li>
                            ))}
                          </ul>
                        ) : jobDetails?.failed_requirements && jobDetails.failed_requirements.length > 0 ? (
                          <ul className="list-disc list-inside text-slate-300 flex flex-col gap-1">
                            {jobDetails.failed_requirements.map((req, i) => (
                              <li key={i} className="truncate">{req}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-500">Risk exceeds set threshold. No strict rule violations.</span>
                        )}
                      </div>
                    </div>

                    {uiSimStatus === "escalated" ? (
                      <div className="bg-[#ff3366]/10 border border-[#ff3366]/30 text-[#ff3366] rounded p-4 text-center font-digital text-[10px] uppercase tracking-wider flex items-center justify-center gap-2">
                        <ShieldAlert size={14} className="animate-ping" /> Emergency SLA Escalation Active: Autonomous maneuvers completed.
                      </div>
                    ) : (
                      <div className="flex gap-3 pt-2">
                        <button 
                          onClick={handleActionCenterEscalate}
                          className="bg-[#ff3366]/10 hover:bg-[#ff3366]/20 border border-[#ff3366]/30 text-[#ff3366] rounded-lg px-4 py-2.5 font-digital text-[10px] uppercase tracking-wider flex-1 transition-all duration-200"
                        >
                          Manual Escalation (Avoidance Burn)
                        </button>
                        <button 
                          onClick={handleActionCenterApprove}
                          className="bg-[#00ff9d] hover:bg-[#00ff9d]/90 text-black rounded-lg px-5 py-2.5 font-digital text-xs uppercase tracking-wider flex-1 transition-all duration-200 font-bold shadow-[0_0_15px_rgba(0,255,157,0.3)]"
                        >
                          Approve Licensing Waiver
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Result Summary Details Card */}
              {uiSimStatus === "completed" && jobDetails && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="cyber-panel p-5 border-[#00ff9d]/20 bg-[#00ff9d]/[0.01]"
                >
                  <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 mb-4">
                    <ShieldCheck className="text-[#00ff9d] h-5 w-5" />
                    <div>
                      <span className="eyebrow block">Workflow Result</span>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-white">License Granted Successfully</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-[#0c0c16] border border-white/[0.05] p-3 rounded text-center">
                      <span className="eyebrow block mb-1">Registration ID</span>
                      <span className="font-digital text-sm text-[#00ff9d] font-bold">{registryDetails?.registration_id}</span>
                    </div>
                    <div className="bg-[#0c0c16] border border-white/[0.05] p-3 rounded text-center">
                      <span className="eyebrow block mb-1">Sustainability Index</span>
                      <span className="font-digital text-sm text-[#00d4ff] font-bold">
                        {jobDetails.result?.sustainability_analysis?.sustainability_index || "82"}/100
                      </span>
                    </div>
                    <div className="bg-[#0c0c16] border border-white/[0.05] p-3 rounded text-center">
                      <span className="eyebrow block mb-1">Waiver Process</span>
                      <span className="font-digital text-sm text-[#ffb700] font-bold">
                        {jobDetails.sla_expires_at === null ? "Manual Approved" : "Auto Approved"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-black/[0.2] border border-white/[0.04] p-3 rounded font-mono text-[9px] text-slate-400">
                    <span className="text-white block font-bold mb-1 uppercase">Executive Summary Report Excerpt</span>
                    <p className="leading-relaxed">
                      {jobDetails.report ? jobDetails.report.substring(0, 320) + "..." : "No summary generated."}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
