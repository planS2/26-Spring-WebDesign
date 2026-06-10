import json
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "public" / "data" / "live-landmarks.json"
sys.path.insert(0, str(ROOT))

from backend.main import _init_account_db

CORE_CATEGORIES = {
    "milan_duomo": "cathedral",
    "venice_rialto": "bridge",
    "florence_duomo": "cathedral",
    "pisa": "tower",
    "colosseum": "arena",
    "pompeii": "ruins",
    "pantheon_rome": "dome",
    "trevi_fountain": "fountain",
    "roman_forum": "ruins",
    "uffizi_gallery": "museum",
    "siena_cathedral": "cathedral",
    "verona_arena": "arena",
    "st_marks_basilica": "cathedral",
    "doges_palace": "palace",
    "cinque_terre": "coast",
    "lake_como": "lake",
    "mole_antonelliana": "tower",
    "san_vitale_ravenna": "cathedral",
    "assisi_basilica": "cathedral",
    "caserta_palace": "palace",
    "herculaneum": "ruins",
    "paestum": "temple",
    "matera_sassi": "village",
    "alberobello_trulli": "village",
    "castel_del_monte": "castle",
    "amalfi_coast": "coast",
    "valley_of_temples": "temple",
    "mount_etna": "mountain",
    "palermo_cathedral": "cathedral",
    "nuraghe_su_nuraxi": "ruins",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_payload():
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def source_rows(item, imported_at):
    rows = []
    sources = item.get("sources", {})
    wikipedia = sources.get("wikipedia", {})
    for language in ("en", "zh"):
        url = wikipedia.get(language)
        if url:
            rows.append((
                item["id"],
                f"wikipedia_{language}",
                url,
                wikipedia.get("fetchedAt") or imported_at,
                json.dumps(item.get("wikipedia", {}).get(language) or {}, ensure_ascii=False),
            ))

    source_urls = {
        "wikidata": sources.get("wikidata"),
        "official_website": item.get("wikidata", {}).get("officialWebsite"),
        "open_meteo": sources.get("weather"),
        "osrm": sources.get("routing"),
    }
    for source_type, url in source_urls.items():
        if url:
            rows.append((
                item["id"],
                source_type,
                url,
                imported_at,
                json.dumps({"source": source_type}, ensure_ascii=False),
            ))
    return rows


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing")

    _init_account_db()
    payload = load_payload()
    imported_at = now_iso()
    generated_at = payload["generatedAt"]
    items = payload["items"]
    matrix = payload["routeMatrix"]
    ids = matrix["ids"]

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO data_import_batches
                    (id, generated_at, imported_at, item_count, source_count, payload_json)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    secrets.token_hex(12),
                    generated_at,
                    imported_at,
                    len(items),
                    len(payload.get("sources", {})),
                    json.dumps(payload, ensure_ascii=False),
                ),
            )

            for item in items:
                wikidata = item.get("wikidata", {})
                coordinates = item["coordinates"]
                cursor.execute(
                    """
                    INSERT INTO landmarks_catalog
                        (id, wikidata_id, category, longitude, latitude, official_website,
                         heritage_id, inception, open_days, image_url, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(id) DO UPDATE SET
                        wikidata_id = excluded.wikidata_id,
                        category = excluded.category,
                        longitude = excluded.longitude,
                        latitude = excluded.latitude,
                        official_website = excluded.official_website,
                        heritage_id = excluded.heritage_id,
                        inception = excluded.inception,
                        open_days = excluded.open_days,
                        image_url = excluded.image_url,
                        updated_at = excluded.updated_at
                    """,
                    (
                        item["id"],
                        item.get("wikidataId"),
                        item.get("category") or CORE_CATEGORIES.get(item["id"], "monument"),
                        coordinates["lon"],
                        coordinates["lat"],
                        wikidata.get("officialWebsite"),
                        wikidata.get("heritageId"),
                        wikidata.get("inception"),
                        wikidata.get("openDays"),
                        wikidata.get("image"),
                        imported_at,
                    ),
                )

                for language in ("en", "zh"):
                    wiki = item["wikipedia"][language]
                    cursor.execute(
                        """
                        INSERT INTO landmark_localizations
                            (landmark_id, language, name, summary, wikipedia_url,
                             thumbnail_url, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT(landmark_id, language) DO UPDATE SET
                            name = excluded.name,
                            summary = excluded.summary,
                            wikipedia_url = excluded.wikipedia_url,
                            thumbnail_url = excluded.thumbnail_url,
                            updated_at = excluded.updated_at
                        """,
                        (
                            item["id"],
                            language,
                            item["name"][language],
                            wiki["extract"],
                            wiki["pageUrl"],
                            wiki.get("thumbnail"),
                            imported_at,
                        ),
                    )

                for row in source_rows(item, imported_at):
                    cursor.execute(
                        """
                        INSERT INTO landmark_sources
                            (landmark_id, source_type, source_url, fetched_at, metadata_json)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT(landmark_id, source_type, source_url) DO UPDATE SET
                            fetched_at = excluded.fetched_at,
                            metadata_json = excluded.metadata_json
                        """,
                        row,
                    )

                weather = item["weather"]
                cursor.execute(
                    """
                    INSERT INTO weather_observations
                        (landmark_id, observed_at, temperature_c, weather_code,
                         wind_kph, source_url, imported_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(landmark_id, observed_at) DO UPDATE SET
                        temperature_c = excluded.temperature_c,
                        weather_code = excluded.weather_code,
                        wind_kph = excluded.wind_kph,
                        source_url = excluded.source_url,
                        imported_at = excluded.imported_at
                    """,
                    (
                        item["id"],
                        weather["observedAt"],
                        weather["temperatureC"],
                        weather["weatherCode"],
                        weather["windKph"],
                        item["sources"]["weather"],
                        imported_at,
                    ),
                )

            for from_index, from_id in enumerate(ids):
                for to_index, to_id in enumerate(ids):
                    cursor.execute(
                        """
                        INSERT INTO route_metrics
                            (from_landmark_id, to_landmark_id, distance_km,
                             duration_hours, source_url, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT(from_landmark_id, to_landmark_id) DO UPDATE SET
                            distance_km = excluded.distance_km,
                            duration_hours = excluded.duration_hours,
                            source_url = excluded.source_url,
                            updated_at = excluded.updated_at
                        """,
                        (
                            from_id,
                            to_id,
                            matrix["distancesKm"][from_index][to_index],
                            matrix["durationsHours"][from_index][to_index],
                            payload["sources"]["routing"],
                            imported_at,
                        ),
                    )

    print(f"Imported {len(items)} landmarks, {len(items) * 2} localizations, and {len(ids) ** 2} route metrics.")


if __name__ == "__main__":
    main()
