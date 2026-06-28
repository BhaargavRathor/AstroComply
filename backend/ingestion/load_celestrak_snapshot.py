"""
load_celestrak_snapshot.py
──────────────────────────
Reads data/raw/celestrak_active.json and loads it into the satellites,
orbital_parameters, and risk_assessments tables.

Usage:
    python -m backend.ingestion.load_celestrak_snapshot

Safe to re-run — uses ON CONFLICT DO UPDATE (upsert).
"""

import json
import sys
from sqlalchemy import text
from backend.database.db import engine
from backend.risk.orbit_classifier import compute_all_orbital_elements
from backend.risk.risk_engine import calculate_risk

JSON_PATH = "data/raw/celestrak_active.json"

print(f"[MOSIP] Loading satellite data from {JSON_PATH} ...")

try:
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        satellites = json.load(f)
except FileNotFoundError:
    print(f"[ERROR] File not found: {JSON_PATH}")
    print("        Run: python -m backend.ingestion.fetch_celestrak  first.")
    sys.exit(1)

print(f"[MOSIP] Found {len(satellites):,} satellite records. Starting load ...")

inserted = 0
updated  = 0
errors   = 0

with engine.begin() as conn:

    for sat in satellites[:150]:
        try:
            norad_id    = sat.get("NORAD_CAT_ID")
            mean_motion = sat.get("MEAN_MOTION")
            eccentricity = sat.get("ECCENTRICITY")
            inclination  = sat.get("INCLINATION")
            raan         = sat.get("RA_OF_ASC_NODE")
            aop          = sat.get("ARG_OF_PERICENTER")
            mean_anomaly = sat.get("MEAN_ANOMALY")
            rev_at_epoch = sat.get("REV_AT_EPOCH")

            if not norad_id:
                errors += 1
                continue

            # ── 1. Upsert satellite ───────────────────────────────────────────
            result = conn.execute(text("""
                INSERT INTO satellites (
                    norad_id, object_name, object_id, epoch_time,
                    inclination, eccentricity, mean_motion, bstar,
                    raan, arg_of_perigee, mean_anomaly, rev_at_epoch
                )
                VALUES (
                    :norad_id, :object_name, :object_id, :epoch_time,
                    :inclination, :eccentricity, :mean_motion, :bstar,
                    :raan, :arg_of_perigee, :mean_anomaly, :rev_at_epoch
                )
                ON CONFLICT (norad_id) DO UPDATE SET
                    object_name   = EXCLUDED.object_name,
                    epoch_time    = EXCLUDED.epoch_time,
                    inclination   = EXCLUDED.inclination,
                    eccentricity  = EXCLUDED.eccentricity,
                    mean_motion   = EXCLUDED.mean_motion,
                    bstar         = EXCLUDED.bstar,
                    raan          = EXCLUDED.raan,
                    arg_of_perigee = EXCLUDED.arg_of_perigee,
                    mean_anomaly  = EXCLUDED.mean_anomaly,
                    rev_at_epoch  = EXCLUDED.rev_at_epoch,
                    updated_at    = NOW()
                RETURNING id, (xmax = 0) AS is_insert
            """), {
                "norad_id":     norad_id,
                "object_name":  sat.get("OBJECT_NAME"),
                "object_id":    sat.get("OBJECT_ID"),
                "epoch_time":   sat.get("EPOCH"),
                "inclination":  inclination,
                "eccentricity": eccentricity,
                "mean_motion":  mean_motion,
                "bstar":        sat.get("BSTAR"),
                "raan":         raan,
                "arg_of_perigee": aop,
                "mean_anomaly": mean_anomaly,
                "rev_at_epoch": rev_at_epoch,
            })

            row = result.fetchone()
            satellite_id = row[0]
            is_insert = row[1]

            if is_insert:
                inserted += 1
            else:
                updated += 1

            # ── 2. Compute orbital elements ───────────────────────────────────
            orbital = compute_all_orbital_elements(
                mean_motion=mean_motion,
                eccentricity=eccentricity or 0.0,
                inclination=inclination,
                raan=raan,
                arg_of_perigee=aop,
            )

            # ── 3. Upsert orbital_parameters ──────────────────────────────────
            conn.execute(text("""
                INSERT INTO orbital_parameters (
                    satellite_id, epoch_time, inclination, eccentricity,
                    mean_motion, altitude_km, apogee_km, perigee_km,
                    semi_major_axis, raan, arg_of_perigee, period_minutes, orbit_type
                )
                VALUES (
                    :satellite_id, :epoch_time, :inclination, :eccentricity,
                    :mean_motion, :altitude_km, :apogee_km, :perigee_km,
                    :semi_major_axis, :raan, :arg_of_perigee, :period_minutes, :orbit_type
                )
                ON CONFLICT DO NOTHING
            """), {
                "satellite_id":   satellite_id,
                "epoch_time":     sat.get("EPOCH"),
                "inclination":    orbital["inclination"],
                "eccentricity":   orbital["eccentricity"],
                "mean_motion":    mean_motion,
                "altitude_km":    orbital["altitude_km"],
                "apogee_km":      orbital["apogee_km"],
                "perigee_km":     orbital["perigee_km"],
                "semi_major_axis": orbital["semi_major_axis_km"],
                "raan":           orbital["raan"],
                "arg_of_perigee": orbital["arg_of_perigee"],
                "period_minutes": orbital["period_minutes"],
                "orbit_type":     orbital["orbit_type"],
            })

            # ── 4. Compute and store risk assessment ──────────────────────────
            import json as _json
            risk = calculate_risk(
                orbit_type=orbital["orbit_type"],
                altitude_km=orbital["altitude_km"],
                inclination=inclination,
                eccentricity=eccentricity,
            )

            conn.execute(text("""
                INSERT INTO risk_assessments (
                    satellite_id, risk_score, risk_level,
                    collision_risk, debris_risk, altitude_risk,
                    orbit_type, risk_drivers
                )
                VALUES (
                    :satellite_id, :risk_score, :risk_level,
                    :collision_risk, :debris_risk, :altitude_risk,
                    :orbit_type, :risk_drivers
                )
                ON CONFLICT DO NOTHING
            """), {
                "satellite_id":   satellite_id,
                "risk_score":     risk["risk_score"],
                "risk_level":     risk["risk_level"],
                "collision_risk": risk["collision_risk"],
                "debris_risk":    risk["debris_risk"],
                "altitude_risk":  risk["altitude_risk"],
                "orbit_type":     orbital["orbit_type"],
                "risk_drivers":   _json.dumps(risk["risk_drivers"]),
            })

        except Exception as e:
            errors += 1
            print(f"  [WARN] Error processing NORAD {sat.get('NORAD_CAT_ID')}: {e}")

    # ── Log the ingestion run ─────────────────────────────────────────────────
    conn.execute(text("""
        INSERT INTO ingestion_logs (source_name, records_ingested, status)
        VALUES ('CelesTrak', :count, 'success')
    """), {"count": inserted + updated})

print()
print("[MOSIP] Load complete.")
print(f"         Inserted : {inserted:,}")
print(f"         Updated  : {updated:,}")
print(f"         Errors   : {errors}")
print(f"         Total    : {inserted + updated:,} satellites processed")