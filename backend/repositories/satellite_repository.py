import logging
from sqlalchemy import text
from backend.database.db import engine

logger = logging.getLogger(__name__)

# Fallback mock satellites list in case PostgreSQL database is offline
def get_mock_satellites():
    try:
        from knowledge_layer.db_service import MOCK_SATELLITES
        return MOCK_SATELLITES
    except Exception:
        # Emergency backup if import fails
        return [
            {
                "id": 1, "norad_id": 25544, "object_name": "ISS (ZARYA)", "object_id": "1998-067A",
                "inclination": 51.64, "eccentricity": 0.0008, "mean_motion": 15.49, "bstar": 0.0001,
                "altitude_km": 420.0, "apogee_km": 423.0, "perigee_km": 417.0, "orbit_type": "LEO",
                "risk_score": 42.0, "risk_level": "MEDIUM"
            },
            {
                "id": 2, "norad_id": 43013, "object_name": "SENTINEL-5P", "object_id": "2017-064A",
                "inclination": 98.7, "eccentricity": 0.0001, "mean_motion": 14.2, "bstar": 0.00005,
                "altitude_km": 824.0, "apogee_km": 825.0, "perigee_km": 823.0, "orbit_type": "LEO",
                "risk_score": 63.0, "risk_level": "HIGH"
            },
            {
                "id": 3, "norad_id": 40294, "object_name": "HIMAWARI-8", "object_id": "2014-060A",
                "inclination": 0.05, "eccentricity": 0.0002, "mean_motion": 1.0, "bstar": 0.0,
                "altitude_km": 35786.0, "apogee_km": 35790.0, "perigee_km": 35782.0, "orbit_type": "GEO",
                "risk_score": 18.0, "risk_level": "LOW"
            },
            {
                "id": 4, "norad_id": 33591, "object_name": "NOAA-19", "object_id": "2009-005A",
                "inclination": 99.2, "eccentricity": 0.0012, "mean_motion": 14.1, "bstar": 0.0002,
                "altitude_km": 870.0, "apogee_km": 878.0, "perigee_km": 862.0, "orbit_type": "LEO",
                "risk_score": 78.0, "risk_level": "CRITICAL"
            }
        ]


class SatelliteRepository:
    """Data-access layer for the satellites table. Falls back to mock data if DB is offline."""

    def get_count(self) -> int:
        try:
            with engine.connect() as conn:
                return conn.execute(text("SELECT COUNT(*) FROM satellites")).scalar() or 0
        except Exception as e:
            logger.warning(f"Database offline, falling back to mock data: {e}")
            return len(get_mock_satellites())

    def get_all(self, limit: int = 100, offset: int = 0) -> list:
        sql = text("""
            SELECT id, norad_id, object_name, object_id, epoch_time,
                   inclination, eccentricity, mean_motion, bstar
            FROM   satellites
            ORDER  BY norad_id
            LIMIT  :limit OFFSET :offset
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql, {"limit": limit, "offset": offset}).fetchall()
                return [dict(row._mapping) for row in rows]
        except Exception:
            return get_mock_satellites()[offset:offset+limit]

    def get_by_norad_id(self, norad_id: int) -> dict | None:
        sql = text("""
            SELECT s.id, s.norad_id, s.object_name, s.object_id, s.epoch_time,
                   s.inclination, s.eccentricity, s.mean_motion, s.bstar,
                   s.raan, s.arg_of_perigee
            FROM   satellites s
            WHERE  s.norad_id = :norad_id
        """)
        try:
            with engine.connect() as conn:
                row = conn.execute(sql, {"norad_id": norad_id}).fetchone()
                return dict(row._mapping) if row else None
        except Exception:
            for sat in get_mock_satellites():
                if sat["norad_id"] == norad_id:
                    return sat
            return None

    def get_by_name(self, name: str, limit: int = 20) -> list:
        sql = text("""
            SELECT s.norad_id, s.object_name, s.object_id, s.inclination, s.mean_motion,
                   op.altitude_km, op.orbit_type, r.risk_score, r.risk_level
            FROM   satellites s
            LEFT   JOIN LATERAL (
                SELECT altitude_km, orbit_type
                FROM   orbital_parameters
                WHERE  satellite_id = s.id
                ORDER  BY created_at DESC
                LIMIT  1
            ) op ON true
            LEFT   JOIN LATERAL (
                SELECT risk_score, risk_level
                FROM   risk_assessments
                WHERE  satellite_id = s.id
                ORDER  BY assessed_at DESC
                LIMIT  1
            ) r ON true
            WHERE  UPPER(s.object_name) LIKE UPPER(:pattern)
               OR  CAST(s.norad_id AS TEXT) LIKE :pattern
            ORDER  BY s.object_name
            LIMIT  :limit
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql, {"pattern": f"%{name}%", "limit": limit}).fetchall()
                return [dict(row._mapping) for row in rows]
        except Exception:
            results = []
            for sat in get_mock_satellites():
                if name.upper() in sat["object_name"].upper() or name in str(sat["norad_id"]):
                    results.append({
                        "norad_id": sat["norad_id"],
                        "object_name": sat["object_name"],
                        "object_id": sat.get("object_id", ""),
                        "inclination": sat.get("inclination", 0.0),
                        "mean_motion": sat.get("mean_motion", 0.0),
                        "altitude_km": sat.get("altitude_km", 600.0),
                        "orbit_type": sat.get("orbit_type", "LEO"),
                        "risk_score": sat.get("risk_score", 0.0),
                        "risk_level": sat.get("risk_level", "LOW")
                    })
            return results[:limit]

    def get_full_profile(self, norad_id: int) -> dict | None:
        sql = text("""
            SELECT
                s.norad_id,
                s.object_name,
                s.object_id,
                s.epoch_time,
                op.altitude_km,
                op.apogee_km,
                op.perigee_km,
                op.orbit_type,
                op.period_minutes,
                op.inclination,
                op.eccentricity,
                op.raan,
                op.arg_of_perigee,
                r.risk_score,
                r.risk_level,
                r.collision_risk,
                r.debris_risk,
                r.altitude_risk,
                r.risk_drivers
            FROM   satellites s
            LEFT   JOIN orbital_parameters op ON op.satellite_id = s.id
            LEFT   JOIN risk_assessments   r  ON r.satellite_id  = s.id
            WHERE  s.norad_id = :norad_id
            ORDER  BY op.created_at DESC, r.assessed_at DESC
            LIMIT  1
        """)
        try:
            with engine.connect() as conn:
                row = conn.execute(sql, {"norad_id": norad_id}).fetchone()
                return dict(row._mapping) if row else None
        except Exception:
            for sat in get_mock_satellites():
                if sat["norad_id"] == norad_id:
                    import json
                    return {
                        "norad_id": sat["norad_id"],
                        "object_name": sat["object_name"],
                        "object_id": sat.get("object_id", ""),
                        "epoch_time": sat.get("epoch_time", "2026-06-11T12:00:00"),
                        "altitude_km": sat.get("altitude_km", 600.0),
                        "apogee_km": sat.get("apogee_km", 610.0),
                        "perigee_km": sat.get("perigee_km", 590.0),
                        "orbit_type": sat.get("orbit_type", "LEO"),
                        "period_minutes": sat.get("period_minutes", 95.0),
                        "inclination": sat.get("inclination", 50.0),
                        "eccentricity": sat.get("eccentricity", 0.001),
                        "raan": sat.get("raan", 0.0),
                        "arg_of_perigee": sat.get("arg_of_perigee", 0.0),
                        "risk_score": sat.get("risk_score", 0.0),
                        "risk_level": sat.get("risk_level", "LOW"),
                        "collision_risk": sat.get("collision_risk", sat.get("risk_score", 0.0) * 0.8),
                        "debris_risk": sat.get("debris_risk", sat.get("risk_score", 0.0) * 0.7),
                        "altitude_risk": sat.get("altitude_risk", sat.get("risk_score", 0.0) * 0.6),
                        "risk_drivers": sat.get("risk_drivers", json.dumps(["Nominal shell occupation"]))
                    }
            return None

    def get_satellites_with_risk(self, limit: int = 100, offset: int = 0) -> list:
        sql = text("""
            SELECT
                s.norad_id,
                s.object_name,
                op.altitude_km,
                op.orbit_type,
                r.risk_score,
                r.risk_level
            FROM   satellites s
            LEFT   JOIN LATERAL (
                SELECT altitude_km, orbit_type
                FROM   orbital_parameters
                WHERE  satellite_id = s.id
                ORDER  BY created_at DESC
                LIMIT  1
            ) op ON true
            LEFT   JOIN LATERAL (
                SELECT risk_score, risk_level
                FROM   risk_assessments
                WHERE  satellite_id = s.id
                ORDER  BY assessed_at DESC
                LIMIT  1
            ) r ON true
            ORDER  BY s.norad_id
            LIMIT  :limit OFFSET :offset
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql, {"limit": limit, "offset": offset}).fetchall()
                return [dict(row._mapping) for row in rows]
        except Exception:
            results = []
            for sat in get_mock_satellites():
                results.append({
                    "norad_id": sat["norad_id"],
                    "object_name": sat["object_name"],
                    "altitude_km": sat.get("altitude_km", 600.0),
                    "orbit_type": sat.get("orbit_type", "LEO"),
                    "risk_score": sat.get("risk_score", 0.0),
                    "risk_level": sat.get("risk_level", "LOW")
                })
            return results[offset:offset+limit]

    def get_by_orbit_type(self, orbit_type: str, limit: int = 100) -> list:
        sql = text("""
            SELECT s.norad_id, s.object_name, op.altitude_km,
                   op.inclination, r.risk_score, r.risk_level
            FROM   satellites s
            JOIN   orbital_parameters op ON op.satellite_id = s.id
            LEFT   JOIN risk_assessments r ON r.satellite_id = s.id
            WHERE  op.orbit_type = :orbit_type
            ORDER  BY r.risk_score DESC NULLS LAST
            LIMIT  :limit
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql, {"orbit_type": orbit_type.upper(), "limit": limit}).fetchall()
                return [dict(row._mapping) for row in rows]
        except Exception:
            results = []
            for sat in get_mock_satellites():
                if sat.get("orbit_type", "").upper() == orbit_type.upper():
                    results.append({
                        "norad_id": sat["norad_id"],
                        "object_name": sat["object_name"],
                        "altitude_km": sat.get("altitude_km", 600.0),
                        "inclination": sat.get("inclination", 0.0),
                        "risk_score": sat.get("risk_score", 0.0),
                        "risk_level": sat.get("risk_level", "LOW")
                    })
            return results[:limit]

    def get_high_risk(self, threshold: float = 50.0, limit: int = 50) -> list:
        sql = text("""
            SELECT s.norad_id, s.object_name, r.risk_score, r.risk_level,
                   r.orbit_type, r.risk_drivers
            FROM   risk_assessments r
            JOIN   satellites s ON s.id = r.satellite_id
            WHERE  r.risk_score >= :threshold
            ORDER  BY r.risk_score DESC
            LIMIT  :limit
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql, {"threshold": threshold, "limit": limit}).fetchall()
                return [dict(row._mapping) for row in rows]
        except Exception:
            results = []
            for sat in get_mock_satellites():
                if sat.get("risk_score", 0.0) >= threshold:
                    results.append({
                        "norad_id": sat["norad_id"],
                        "object_name": sat["object_name"],
                        "risk_score": sat["risk_score"],
                        "risk_level": sat["risk_level"],
                        "orbit_type": sat.get("orbit_type", "LEO"),
                        "risk_drivers": sat.get("risk_drivers", "[]")
                    })
            return sorted(results, key=lambda x: x["risk_score"], reverse=True)[:limit]
