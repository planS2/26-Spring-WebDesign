import os

import psycopg


COUNTED_TABLES = (
    "users",
    "sessions",
    "account_history",
    "user_plans",
    "data_import_batches",
    "landmarks_catalog",
    "landmark_localizations",
    "landmark_sources",
    "weather_observations",
    "route_metrics",
)


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing")

    with psycopg.connect(database_url) as connection:
        rows = connection.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
            """
        ).fetchall()
        database_name, user_name = connection.execute(
            "SELECT current_database(), current_user"
        ).fetchone()
        table_names = {row[0] for row in rows}
        counts = {}
        for table_name in COUNTED_TABLES:
            if table_name in table_names:
                counts[table_name] = connection.execute(
                    f'SELECT COUNT(*) FROM "{table_name}"'
                ).fetchone()[0]
        samples = []
        if "landmarks_catalog" in table_names:
            samples = connection.execute(
                """
                SELECT catalog.id, zh.name, en.name
                FROM landmarks_catalog AS catalog
                JOIN landmark_localizations AS zh
                  ON zh.landmark_id = catalog.id AND zh.language = 'zh'
                JOIN landmark_localizations AS en
                  ON en.landmark_id = catalog.id AND en.language = 'en'
                WHERE catalog.id IN ('colosseum', 'pompeii', 'castel_del_monte')
                ORDER BY catalog.id
                """
            ).fetchall()

    print(f"database={database_name}")
    print(f"user={user_name}")
    print("tables=" + ",".join(row[0] for row in rows))
    for table_name, count in counts.items():
        print(f"{table_name}={count}")
    for landmark_id, zh_name, en_name in samples:
        print(f"sample={landmark_id}|{zh_name}|{en_name}")


if __name__ == "__main__":
    main()
