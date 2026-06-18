import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from knowledge_layer.orchestrator import run_full_assessment
from backend.api.routes.assess import _format_assessment

router = APIRouter()

# In-memory database to store simulation jobs for the UiPath Orchestrator workflow
uipath_jobs: Dict[str, Dict[str, Any]] = {}


class UiPathJobSubmitRequest(BaseModel):
    operator_id: str = Field(..., description="ID of the satellite operator")
    object_name: str = Field(..., description="Name of the satellite / launch object")
    altitude_km: Optional[float] = Field(650.0, description="Target mean altitude (km)")
    inclination: Optional[float] = Field(55.2, description="Target inclination (degrees)")
    eccentricity: Optional[float] = Field(0.001, description="Target eccentricity")
    raan: Optional[float] = Field(0.0, description="Right Ascension of Ascending Node (deg)")
    arg_of_perigee: Optional[float] = Field(0.0, description="Argument of perigee (deg)")
    mean_motion: Optional[float] = Field(None, description="TLE mean motion (rev/day)")
    debris_density: Optional[float] = Field(12.4, description="Debris density in target shell")
    conjunction_frequency: Optional[float] = Field(3.5, description="Estimated conjunctions per week")
    risk_threshold: Optional[float] = Field(50.0, description="Risk threshold to trigger Action Center")


class EscalateRequest(BaseModel):
    job_id: str
    reason: Optional[str] = "SLA Breach / Unresolved Risk"


class AssetRegisterRequest(BaseModel):
    job_id: str
    operator_id: str
    object_name: str
    orbit_type: str
    altitude_km: float


# ── Background Worker ─────────────────────────────────────────────────────────

def run_uipath_audit_background(job_id: str, raw_params: dict, risk_threshold: float):
    """
    Executes the multi-agent LangGraph analysis in the background.
    Evaluates risk and compliance parameters to determine if human intervention is needed.
    """
    try:
        # Run the full LangGraph pipeline
        state = run_full_assessment(raw_params=raw_params)
        formatted = _format_assessment(state)

        # Extract risk parameters
        risk_analysis = formatted.get("collision_analysis", {})
        risk_score = risk_analysis.get("risk_score")
        if risk_score is None:
            risk_score = state.get("risk_data", {}).get("risk_score", 0.0)
        risk_level = risk_analysis.get("risk_level") or state.get("risk_data", {}).get("risk_level", "LOW")

        # Extract compliance violations
        compliance_analysis = formatted.get("compliance_analysis", {})
        failed_reqs = compliance_analysis.get("failed_requirements", [])
        violations = compliance_analysis.get("critical_violations", [])

        # Update job database entry
        uipath_jobs[job_id]["risk_score"] = float(risk_score) if risk_score is not None else 0.0
        uipath_jobs[job_id]["risk_level"] = risk_level
        uipath_jobs[job_id]["failed_requirements"] = failed_reqs
        uipath_jobs[job_id]["violations"] = violations
        uipath_jobs[job_id]["report"] = formatted.get("report", "")
        uipath_jobs[job_id]["result"] = formatted
        uipath_jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()

        # Check thresholds
        has_violations = len(failed_reqs) > 0 or len(violations) > 0
        if uipath_jobs[job_id]["risk_score"] > risk_threshold or has_violations:
            uipath_jobs[job_id]["status"] = "ACTION_CENTER"
            # 15 minute SLA
            uipath_jobs[job_id]["sla_expires_at"] = (datetime.utcnow() + timedelta(minutes=15)).isoformat()
        else:
            uipath_jobs[job_id]["status"] = "APPROVED"

    except Exception as e:
        uipath_jobs[job_id]["status"] = "FAILED"
        uipath_jobs[job_id]["errors"] = [str(e)]
        uipath_jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/job/submit", summary="Submit a satellite parameters job for multi-agent auditing")
def submit_job(payload: UiPathJobSubmitRequest, background_tasks: BackgroundTasks):
    """
    Submits a satellite profile. Starts the multi-agent LangGraph analysis in the background
    and returns a unique job identifier.
    """
    job_id = f"job-{uuid.uuid4().hex[:8]}"

    raw_params = {
        "altitude_km": payload.altitude_km,
        "inclination": payload.inclination,
        "eccentricity": payload.eccentricity,
        "raan": payload.raan,
        "arg_of_perigee": payload.arg_of_perigee,
        "mean_motion": payload.mean_motion,
        "debris_density": payload.debris_density,
        "conjunction_frequency": payload.conjunction_frequency,
    }
    # Clean None values
    raw_params = {k: v for k, v in raw_params.items() if v is not None}

    uipath_jobs[job_id] = {
        "job_id": job_id,
        "operator_id": payload.operator_id,
        "object_name": payload.object_name,
        "status": "PENDING",
        "risk_score": None,
        "risk_level": None,
        "violations": None,
        "failed_requirements": None,
        "passed_requirements": None,
        "report": None,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "sla_expires_at": None,
        "risk_threshold": payload.risk_threshold,
        "result": None,
        "errors": [],
        "escalation_reason": None,
        "raw_params": raw_params
    }

    # Queue background audit execution
    background_tasks.add_task(
        run_uipath_audit_background,
        job_id=job_id,
        raw_params=raw_params,
        risk_threshold=payload.risk_threshold
    )

    return {
        "job_id": job_id,
        "status": "PENDING",
        "message": "Orchestration audit job started successfully in the background.",
        "created_at": uipath_jobs[job_id]["created_at"]
    }


@router.get("/job/status/{job_id}", summary="Check status of a submitted audit job")
def get_job_status(job_id: str):
    """
    Checks the status and results of a submitted job.
    Allows polling for completion of report and Action Center status.
    """
    if job_id not in uipath_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    return uipath_jobs[job_id]


@router.post("/job/approve/{job_id}", summary="Manually approve a job held in Action Center")
def approve_job(job_id: str):
    """
    Simulates a human inspector approving the licensing request in UiPath Action Center.
    Clears the SLA timer and updates status to APPROVED.
    """
    if job_id not in uipath_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    job = uipath_jobs[job_id]
    if job["status"] not in ("ACTION_CENTER", "ESCALATED"):
        raise HTTPException(
            status_code=400,
            detail=f"Job must be in ACTION_CENTER or ESCALATED state. Current: {job['status']}"
        )

    job["status"] = "APPROVED"
    job["sla_expires_at"] = None
    job["updated_at"] = datetime.utcnow().isoformat()

    return {
        "status": "APPROVED",
        "job_id": job_id,
        "message": "Job successfully approved by Inspector.",
        "updated_at": job["updated_at"]
    }


@router.get("/sap/check-fee/{operator_id}", summary="Verify operator payment status via mock SAP billing")
def check_fee(operator_id: str):
    """
    Checks the payment status of the satellite operator in a simulated SAP billing database.
    Delinquent operators (containing 'unpaid' or 'delinquent' in their ID) fail verification.
    """
    is_paid = "unpaid" not in operator_id.lower() and "delinquent" not in operator_id.lower()
    return {
        "operator_id": operator_id,
        "status": "PAID" if is_paid else "UNPAID",
        "balance": 0.0 if is_paid else 2500.0,
        "fee_amount": 2500.0,
        "payment_verified": is_paid
    }


@router.post("/sap/register-asset", summary="Register approved satellite in the external registry")
def register_asset(payload: AssetRegisterRequest):
    """
    Mocks asset registration via a UiPath RPA bot connecting to an external space asset registry.
    """
    registration_id = f"REG-{uuid.uuid4().hex[:8].upper()}"
    return {
        "status": "SUCCESS",
        "registration_id": registration_id,
        "registered_at": datetime.utcnow().isoformat(),
        "asset_details": payload.model_dump()
    }


@router.post("/escalate", summary="Trigger emergency escalation / autonomous thruster maneuver")
def escalate_job(payload: EscalateRequest):
    """
    Sets the job status to ESCALATED and triggers emergency autonomous collision avoidance maneuvers.
    """
    job_id = payload.job_id
    if job_id not in uipath_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    uipath_jobs[job_id]["status"] = "ESCALATED"
    uipath_jobs[job_id]["escalation_reason"] = payload.reason
    uipath_jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()

    maneuver_log = [
        "SLA breach detected or manual override triggered.",
        "Executing emergency collision avoidance maneuvers.",
        "Calculated optimal thrust vector Delta-V: 0.14 m/s.",
        "Dispatched autonomous fire sequence commands to onboard thrusters.",
        "Maneuver executed successfully. Collision probability reduced below safety limit."
    ]

    return {
        "status": "ESCALATED",
        "job_id": job_id,
        "maneuvers_executed": True,
        "maneuver_details": maneuver_log,
        "updated_at": uipath_jobs[job_id]["updated_at"]
    }
