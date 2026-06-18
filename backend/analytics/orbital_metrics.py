import logging
from sqlalchemy import text
from backend.database.db import engine

logger = logging.getLogger(__name__)

def get_mock_satellites():
    try:
        from knowledge_layer.db_service import MOCK_SATELLITES
        return MOCK_SATELLITES
    except Exception:
        # Fallback list if import fails
        return [
            {"norad_id": 25544, "object_name": "ISS (ZARYA)", "orbit_type": "LEO", "altitude_km": 420.0, "risk_score": 42.0, "risk_level": "MEDIUM"},
            {"norad_id": 43013, "object_name": "SENTINEL-5P", "orbit_type": "LEO", "altitude_km": 824.0, "risk_score": 63.0, "risk_level": "HIGH"},
            {"norad_id": 40294, "object_name": "HIMAWARI-8", "orbit_type": "GEO", "altitude_km": 35786.0, "risk_score": 18.0, "risk_level": "LOW"},
            {"norad_id": 33591, "object_name": "NOAA-19", "orbit_type": "LEO", "altitude_km": 870.0, "risk_score": 78.0, "risk_level": "CRITICAL"}
        ]


class OrbitalMetrics:
    """
    Aggregate analytics over the full satellite population in the DB.
    Falls back to mock computations if PostgreSQL is offline.
    """

    def count_by_orbit(self) -> dict:
        sql = text("""
            SELECT orbit_type, COUNT(*) AS cnt
            FROM   orbital_parameters
            WHERE  orbit_type IS NOT NULL
            GROUP  BY orbit_type
            ORDER  BY cnt DESC
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql).fetchall()
                return {row[0]: row[1] for row in rows}
        except Exception:
            dist = {}
            for sat in get_mock_satellites():
                o = sat.get("orbit_type", "LEO")
                dist[o] = dist.get(o, 0) + 1
            return dist

    def count_leo(self) -> int:
        try:
            with engine.connect() as conn:
                return conn.execute(text("SELECT COUNT(*) FROM orbital_parameters WHERE orbit_type = 'LEO'")).scalar() or 0
        except Exception:
            return sum(1 for sat in get_mock_satellites() if sat.get("orbit_type") == "LEO")

    def count_vleo(self) -> int:
        try:
            with engine.connect() as conn:
                return conn.execute(text("SELECT COUNT(*) FROM orbital_parameters WHERE orbit_type = 'VLEO'")).scalar() or 0
        except Exception:
            return sum(1 for sat in get_mock_satellites() if sat.get("orbit_type") == "VLEO")

    def count_meo(self) -> int:
        try:
            with engine.connect() as conn:
                return conn.execute(text("SELECT COUNT(*) FROM orbital_parameters WHERE orbit_type = 'MEO'")).scalar() or 0
        except Exception:
            return sum(1 for sat in get_mock_satellites() if sat.get("orbit_type") == "MEO")

    def count_geo(self) -> int:
        try:
            with engine.connect() as conn:
                return conn.execute(text("SELECT COUNT(*) FROM orbital_parameters WHERE orbit_type = 'GEO'")).scalar() or 0
        except Exception:
            return sum(1 for sat in get_mock_satellites() if sat.get("orbit_type") == "GEO")

    def count_heo(self) -> int:
        try:
            with engine.connect() as conn:
                return conn.execute(text("SELECT COUNT(*) FROM orbital_parameters WHERE orbit_type = 'HEO'")).scalar() or 0
        except Exception:
            return sum(1 for sat in get_mock_satellites() if sat.get("orbit_type") == "HEO")

    def average_risk_score(self) -> float:
        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT AVG(risk_score) FROM risk_assessments")).scalar()
                return round(float(result), 2) if result else 0.0
        except Exception:
            sats = get_mock_satellites()
            if not sats:
                return 0.0
            return round(sum(s.get("risk_score", 0.0) for s in sats) / len(sats), 2)

    def risk_distribution(self) -> dict:
        sql = text("""
            SELECT risk_level, COUNT(*)
            FROM   risk_assessments
            GROUP  BY risk_level
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql).fetchall()
                return {row[0]: row[1] for row in rows}
        except Exception:
            dist = {}
            for sat in get_mock_satellites():
                lvl = sat.get("risk_level", "LOW")
                dist[lvl] = dist.get(lvl, 0) + 1
            return dist

    def critical_risk_count(self) -> int:
        try:
            with engine.connect() as conn:
                return conn.execute(text("SELECT COUNT(*) FROM risk_assessments WHERE risk_level = 'CRITICAL'")).scalar() or 0
        except Exception:
            return sum(1 for sat in get_mock_satellites() if sat.get("risk_level") == "CRITICAL")

    def high_risk_satellites(self, limit: int = 10) -> list:
        sql = text("""
            SELECT s.norad_id, s.object_name, r.risk_score, r.risk_level
            FROM   risk_assessments r
            JOIN   satellites s ON s.id = r.satellite_id
            ORDER  BY r.risk_score DESC
            LIMIT  :limit
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql, {"limit": limit}).fetchall()
                return [dict(row._mapping) for row in rows]
        except Exception:
            results = []
            for sat in get_mock_satellites():
                results.append({
                    "norad_id": sat["norad_id"],
                    "object_name": sat["object_name"],
                    "risk_score": sat.get("risk_score", 0.0),
                    "risk_level": sat.get("risk_level", "LOW")
                })
            return sorted(results, key=lambda x: x["risk_score"], reverse=True)[:limit]

    def altitude_stats(self) -> dict:
        sql = text("""
            SELECT MIN(altitude_km), MAX(altitude_km), AVG(altitude_km)
            FROM   orbital_parameters
        """)
        try:
            with engine.connect() as conn:
                row = conn.execute(sql).fetchone()
                return {
                    "min_km": round(row[0], 2) if row[0] is not None else 0.0,
                    "max_km": round(row[1], 2) if row[1] is not None else 0.0,
                    "avg_km": round(row[2], 2) if row[2] is not None else 0.0
                }
        except Exception:
            alts = [sat.get("altitude_km") for sat in get_mock_satellites() if sat.get("altitude_km") is not None]
            if not alts:
                return {"min_km": 0.0, "max_km": 0.0, "avg_km": 0.0}
            return {
                "min_km": min(alts),
                "max_km": max(alts),
                "avg_km": round(sum(alts) / len(alts), 2)
            }

    def altitude_histogram(self, bins: int = 10) -> list:
        sql = text("""
            SELECT
                width_bucket(altitude_km, 0, 2000, :bins) AS bucket,
                COUNT(*) AS cnt
            FROM   orbital_parameters
            WHERE  altitude_km BETWEEN 0 AND 2000
            GROUP  BY bucket
            ORDER  BY bucket
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql, {"bins": bins}).fetchall()
            bucket_width = 2000 // bins
            return [
                {
                    "range": f"{(row[0] - 1) * bucket_width}–{row[0] * bucket_width} km",
                    "count": row[1],
                }
                for row in rows
                if row[0] is not None
            ]
        except Exception:
            bucket_width = 2000 // bins
            buckets = [0] * (bins + 1)
            for sat in get_mock_satellites():
                alt = sat.get("altitude_km", 0.0)
                if 0 <= alt <= 2000:
                    bucket_idx = int(alt // bucket_width) + 1
                    if bucket_idx <= bins:
                        buckets[bucket_idx] += 1
            
            res = []
            for i in range(1, bins + 1):
                res.append({
                    "range": f"{(i - 1) * bucket_width}–{i * bucket_width} km",
                    "count": buckets[i]
                })
            return res

    def population_summary(self) -> dict:
        try:
            total_sql = text("SELECT COUNT(*) FROM satellites")
            with engine.connect() as conn:
                total = conn.execute(total_sql).scalar() or 0
        except Exception:
            total = len(get_mock_satellites())

        return {
            "total_satellites": total,
            "orbit_distribution": self.count_by_orbit(),
            "risk_distribution": self.risk_distribution(),
            "average_risk_score": self.average_risk_score(),
            "critical_risk_count": self.critical_risk_count(),
            "altitude_stats": self.altitude_stats(),
        }