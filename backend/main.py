import math
import os
import secrets
import hashlib
import json
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None
    dict_row = None

app = FastAPI(title='Web3D Landmarks API', version='1.1.0')

allowed_origins = [
    origin.strip()
    for origin in os.getenv('CORS_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',')
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

_LON_MIN, _LON_MAX = 6.6, 18.5
_LAT_MIN, _LAT_MAX = 36.6, 47.1
_WORLD = 170
_DB_PATH = Path(os.getenv('ACCOUNT_DB_PATH', Path(__file__).with_name('accounts.sqlite3')))
_DB_LOCK = Lock()
_PBKDF2_ROUNDS = 120_000
_DATABASE_URL = os.getenv('DATABASE_URL') or os.getenv('POSTGRES_DSN')


class _PostgresConnection:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        self.connection.__enter__()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return self.connection.__exit__(exc_type, exc_value, traceback)

    def execute(self, query, params=None):
        return self.connection.execute(query.replace('?', '%s'), params)

    def executescript(self, script):
        with self.connection.cursor() as cursor:
            for statement in script.split(';'):
                if statement.strip():
                    cursor.execute(statement)

    def commit(self):
        self.connection.commit()

    def close(self):
        self.connection.close()


class AuthPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    name: str | None = Field(default=None, max_length=64)


class HistoryPayload(BaseModel):
    action: str = Field(min_length=1, max_length=80)
    detail: str = Field(default='', max_length=240)


class PlanPayload(BaseModel):
    route_ids: list[str] = Field(default_factory=list, max_length=100)
    locked_ids: list[str] = Field(default_factory=list, max_length=100)
    favorites: list[str] = Field(default_factory=list, max_length=100)
    compare: list[str] = Field(default_factory=list, max_length=100)
    days: int = Field(default=3, ge=1, le=10)
    pace: str = Field(default='Standard', pattern='^(Relaxed|Standard|Fast)$')
    language: str = Field(default='zh', pattern='^(zh|en)$')


class RouteCoordinate(BaseModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class RoutePlanPayload(BaseModel):
    coordinates: list[RouteCoordinate] = Field(min_length=2, max_length=25)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _request_json(url, *, method='GET', headers=None, payload=None, timeout=20):
    body = json.dumps(payload).encode('utf-8') if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


def _decode_google_polyline(encoded):
    coordinates = []
    index = 0
    lat = 0
    lon = 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            result = 0
            shift = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1f) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lon += deltas[1]
        coordinates.append([lon / 100000, lat / 100000])
    return coordinates


def _plan_google_route(coordinates, api_key):
    waypoints = [
        {'location': {'latLng': {'latitude': point.lat, 'longitude': point.lon}}}
        for point in coordinates
    ]
    response = _request_json(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': api_key,
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        payload={
            'origin': waypoints[0],
            'destination': waypoints[-1],
            'intermediates': waypoints[1:-1],
            'travelMode': 'DRIVE',
            'routingPreference': 'TRAFFIC_AWARE',
            'polylineQuality': 'HIGH_QUALITY',
            'polylineEncoding': 'ENCODED_POLYLINE',
        },
    )
    route = (response.get('routes') or [None])[0]
    if not route:
        raise RuntimeError('Google Routes returned no route')
    duration_seconds = float(str(route.get('duration', '0s')).removesuffix('s') or 0)
    return {
        'provider': 'google-routes',
        'distanceKm': round(float(route.get('distanceMeters', 0)) / 1000, 1),
        'durationHours': round(duration_seconds / 3600, 2),
        'geometryCoordinates': _decode_google_polyline(route['polyline']['encodedPolyline']),
    }


def _plan_osrm_route(coordinates):
    encoded = ';'.join(f'{point.lon},{point.lat}' for point in coordinates)
    query = urllib.parse.urlencode({
        'overview': 'full',
        'geometries': 'geojson',
        'annotations': 'false',
        'steps': 'false',
    })
    response = _request_json(f'https://router.project-osrm.org/route/v1/driving/{encoded}?{query}')
    route = (response.get('routes') or [None])[0]
    if not route:
        raise RuntimeError('OSRM returned no route')
    return {
        'provider': 'osrm',
        'distanceKm': round(float(route.get('distance', 0)) / 1000, 1),
        'durationHours': round(float(route.get('duration', 0)) / 3600, 2),
        'geometryCoordinates': route.get('geometry', {}).get('coordinates', []),
    }


def _connect_db():
    if _DATABASE_URL:
        if psycopg is None:
            raise RuntimeError('DATABASE_URL is set but psycopg is not installed')
        return _PostgresConnection(psycopg.connect(_DATABASE_URL, row_factory=dict_row))
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    return connection


def _init_account_db():
    with _DB_LOCK, _connect_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login_at TEXT
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS account_history (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
                action TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_account_history_email_created
            ON account_history(email, created_at DESC);

            CREATE TABLE IF NOT EXISTS user_plans (
                email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
                plan_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS data_import_batches (
                id TEXT PRIMARY KEY,
                generated_at TEXT NOT NULL,
                imported_at TEXT NOT NULL,
                item_count INTEGER NOT NULL,
                source_count INTEGER NOT NULL,
                payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS landmarks_catalog (
                id TEXT PRIMARY KEY,
                wikidata_id TEXT,
                category TEXT,
                longitude DOUBLE PRECISION NOT NULL,
                latitude DOUBLE PRECISION NOT NULL,
                official_website TEXT,
                heritage_id TEXT,
                inception TEXT,
                open_days TEXT,
                image_url TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS landmark_localizations (
                landmark_id TEXT NOT NULL REFERENCES landmarks_catalog(id) ON DELETE CASCADE,
                language TEXT NOT NULL,
                name TEXT NOT NULL,
                summary TEXT NOT NULL,
                wikipedia_url TEXT NOT NULL,
                thumbnail_url TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (landmark_id, language)
            );

            CREATE TABLE IF NOT EXISTS landmark_sources (
                landmark_id TEXT NOT NULL REFERENCES landmarks_catalog(id) ON DELETE CASCADE,
                source_type TEXT NOT NULL,
                source_url TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                PRIMARY KEY (landmark_id, source_type, source_url)
            );

            CREATE TABLE IF NOT EXISTS weather_observations (
                landmark_id TEXT NOT NULL REFERENCES landmarks_catalog(id) ON DELETE CASCADE,
                observed_at TEXT NOT NULL,
                temperature_c DOUBLE PRECISION NOT NULL,
                weather_code INTEGER NOT NULL,
                wind_kph DOUBLE PRECISION NOT NULL,
                source_url TEXT NOT NULL,
                imported_at TEXT NOT NULL,
                PRIMARY KEY (landmark_id, observed_at)
            );

            CREATE TABLE IF NOT EXISTS route_metrics (
                from_landmark_id TEXT NOT NULL REFERENCES landmarks_catalog(id) ON DELETE CASCADE,
                to_landmark_id TEXT NOT NULL REFERENCES landmarks_catalog(id) ON DELETE CASCADE,
                distance_km DOUBLE PRECISION NOT NULL,
                duration_hours DOUBLE PRECISION NOT NULL,
                source_url TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (from_landmark_id, to_landmark_id)
            );

            CREATE INDEX IF NOT EXISTS idx_landmark_sources_type
            ON landmark_sources(source_type);

            CREATE INDEX IF NOT EXISTS idx_weather_landmark_observed
            ON weather_observations(landmark_id, observed_at DESC);

            CREATE INDEX IF NOT EXISTS idx_route_metrics_from
            ON route_metrics(from_landmark_id);
            """
        )
        if _DATABASE_URL:
            connection.execute(
                'ALTER TABLE landmarks_catalog ADD COLUMN IF NOT EXISTS category TEXT'
            )
        else:
            columns = connection.execute('PRAGMA table_info(landmarks_catalog)').fetchall()
            if not any(column['name'] == 'category' for column in columns):
                connection.execute('ALTER TABLE landmarks_catalog ADD COLUMN category TEXT')


def _hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), _PBKDF2_ROUNDS).hex()
    return salt, digest


def _verify_password(password, salt, digest):
    _, candidate = _hash_password(password, salt)
    return secrets.compare_digest(candidate, digest)


def _public_user(email, user):
    return {
        'email': email,
        'name': user['name'],
        'created_at': user['created_at'],
        'last_login_at': user.get('last_login_at'),
    }


def _history_for_email(connection, email, limit=80):
    rows = connection.execute(
        """
        SELECT id, action, detail, created_at
        FROM account_history
        WHERE email = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (email, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def _add_history(connection, email, action, detail=''):
    connection.execute(
        """
        INSERT INTO account_history (id, email, action, detail, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (secrets.token_hex(8), email, action, detail, _now_iso()),
    )


def _plan_for_email(connection, email):
    row = connection.execute(
        'SELECT plan_json, updated_at FROM user_plans WHERE email = ?',
        (email,),
    ).fetchone()
    if row is None:
        return None
    try:
        plan = json.loads(row['plan_json'])
    except json.JSONDecodeError:
        return None
    return {**plan, 'updated_at': row['updated_at']}


def _save_plan(connection, email, plan):
    updated_at = _now_iso()
    connection.execute(
        """
        INSERT INTO user_plans (email, plan_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            plan_json = excluded.plan_json,
            updated_at = excluded.updated_at
        """,
        (email, json.dumps(plan, ensure_ascii=False), updated_at),
    )
    return {**plan, 'updated_at': updated_at}


def _require_user(authorization):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Missing auth token')
    token = authorization.removeprefix('Bearer ').strip()
    with _DB_LOCK, _connect_db() as connection:
        row = connection.execute(
            """
            SELECT users.email, users.name, users.created_at, users.last_login_at
            FROM sessions
            JOIN users ON users.email = sessions.email
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail='Invalid auth token')
        return token, row['email'], dict(row)


@app.on_event('startup')
def startup():
    _init_account_db()


def _merc_y(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


_MERC_Y_MIN = _merc_y(_LAT_MIN)
_MERC_Y_MAX = _merc_y(_LAT_MAX)


def _lnglat_to_world(lon, lat):
    tx = (lon - _LON_MIN) / (_LON_MAX - _LON_MIN)
    tz = 1.0 - (_merc_y(lat) - _MERC_Y_MIN) / (_MERC_Y_MAX - _MERC_Y_MIN)
    x = (tx - 0.5) * _WORLD
    z = (tz - 0.5) * _WORLD
    return [round(x, 2), 0, round(z, 2)]


def _distance_km(a_lon, a_lat, b_lon, b_lat):
    radius = 6371.0
    d_lat = math.radians(b_lat - a_lat)
    d_lon = math.radians(b_lon - a_lon)
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


_RAW_LANDMARKS = [
    {
        'id': 'colosseum',
        'name': 'Colosseum / 罗马斗兽场',
        'description': '古罗马时期最具代表性的圆形竞技场之一，也是罗马城市记忆和帝国建筑尺度的象征。',
        'model_path': '/models/romes_colosseum.glb',
        'lon': 12.4922,
        'lat': 41.8902,
    },
    {
        'id': 'pisa',
        'name': 'Leaning Tower of Pisa / 比萨斜塔',
        'description': '始建于 1173 年的中世纪钟楼，以独特的倾斜结构和广场空间闻名。',
        'model_path': '/models/pisas_tower.glb',
        'lon': 10.3963,
        'lat': 43.7230,
    },
]

MOCK_ROUTE = {
    'id': 'mock_italy_north_to_south',
    'name': 'Milan to Pompeii mock heritage drive',
    'source': 'backend',
    'distance_km': 920,
    'duration_hours': 10.8,
    'notes': 'Schema prepared for OSM, DEM, PostGIS and traffic-aware routing data.',
    'stops': ['milan_duomo', 'venice_rialto', 'florence_duomo', 'pisa', 'colosseum', 'pompeii'],
    'points': [
        {'id': 'milan_entry', 'lon': 9.13, 'lat': 45.49, 'road_type': 'urban', 'speed_limit': 50, 'traffic_state': 'slow', 'surface': 'asphalt', 'bridge': False, 'tunnel': False, 'layer': 0},
        {'id': 'milan_duomo', 'lon': 9.1919, 'lat': 45.4642, 'landmark_id': 'milan_duomo', 'road_type': 'urban', 'speed_limit': 30, 'traffic_state': 'slow', 'surface': 'asphalt', 'bridge': False, 'tunnel': False, 'layer': 0},
        {'id': 'venice_rialto', 'lon': 12.3359, 'lat': 45.438, 'landmark_id': 'venice_rialto', 'road_type': 'pedestrian_context', 'speed_limit': 20, 'traffic_state': 'slow', 'surface': 'stone', 'bridge': True, 'tunnel': False, 'layer': 1},
        {'id': 'florence_duomo', 'lon': 11.2558, 'lat': 43.7731, 'landmark_id': 'florence_duomo', 'road_type': 'urban', 'speed_limit': 30, 'traffic_state': 'slow', 'surface': 'stone', 'bridge': False, 'tunnel': False, 'layer': 0},
        {'id': 'pisa', 'lon': 10.3963, 'lat': 43.723, 'landmark_id': 'pisa', 'road_type': 'urban', 'speed_limit': 30, 'traffic_state': 'slow', 'surface': 'asphalt', 'bridge': False, 'tunnel': False, 'layer': 0},
        {'id': 'colosseum', 'lon': 12.4922, 'lat': 41.8902, 'landmark_id': 'colosseum', 'road_type': 'urban', 'speed_limit': 30, 'traffic_state': 'slow', 'surface': 'stone', 'bridge': False, 'tunnel': False, 'layer': 0},
        {'id': 'pompeii', 'lon': 14.487, 'lat': 40.748, 'landmark_id': 'pompeii', 'road_type': 'urban', 'speed_limit': 30, 'traffic_state': 'normal', 'surface': 'stone', 'bridge': False, 'tunnel': False, 'layer': 0},
    ],
}

LANDMARKS = [
    {
        **{key: value for key, value in item.items() if key not in ('lon', 'lat')},
        'coordinates': _lnglat_to_world(item['lon'], item['lat']),
        'lon': item['lon'],
        'lat': item['lat'],
        'data_source': 'backend',
    }
    for item in _RAW_LANDMARKS
]

MOCK_REVIEWS = {
    'en': {
        'colosseum': [
            {
                'id': 'mock-colosseum-en-1',
                'author': 'Marta H.',
                'score': 4.9,
                'comment': 'The arena reads beautifully from the outer ring. Even a short stop gives you a strong sense of imperial scale.',
                'source': 'Mock editorial note',
            },
            {
                'id': 'mock-colosseum-en-2',
                'author': 'Jonas V.',
                'score': 4.8,
                'comment': 'Best approached slowly. The arches stack into a clear silhouette at golden hour.',
                'source': 'Mock field review',
            },
        ],
        'pisa': [
            {
                'id': 'mock-pisa-en-1',
                'author': 'Elena R.',
                'score': 4.7,
                'comment': 'The square feels calmer than expected, and the tower works best when viewed with the surrounding lawn and cathedral axis.',
                'source': 'Mock editorial note',
            },
            {
                'id': 'mock-pisa-en-2',
                'author': 'Marco T.',
                'score': 4.6,
                'comment': 'Compact, bright, and easy to read spatially. A good final stop for a short route study.',
                'source': 'Mock field review',
            },
        ],
    },
    'zh': {
        'colosseum': [
            {
                'id': 'mock-colosseum-zh-1',
                'author': '玛尔塔',
                'score': 4.9,
                'comment': '从外围拱廊看过去最能感受到斗兽场的尺度感。即使只是短暂停留，也能迅速建立对古罗马空间秩序的印象。',
                'source': '模拟专题笔记',
            },
            {
                'id': 'mock-colosseum-zh-2',
                'author': '约纳斯',
                'score': 4.8,
                'comment': '适合放慢速度接近。黄昏时分，层层叠起的拱券会形成很强的轮廓感。',
                'source': '模拟现场观察',
            },
        ],
        'pisa': [
            {
                'id': 'mock-pisa-zh-1',
                'author': '埃琳娜',
                'score': 4.7,
                'comment': '广场比想象中更安静。如果把草坪、主教堂与斜塔一起看，空间关系会变得非常清晰。',
                'source': '模拟专题笔记',
            },
            {
                'id': 'mock-pisa-zh-2',
                'author': '马可',
                'score': 4.6,
                'comment': '尺度紧凑、光线明亮，作为一条短路线的终点非常合适。',
                'source': '模拟现场观察',
            },
        ],
    },
}


def _find_landmark(landmark_id):
    return next((item for item in LANDMARKS if item['id'] == landmark_id), None)


def _review_payload(landmark, language):
    with _connect_db() as connection:
        row = connection.execute(
            """
            SELECT name, summary, wikipedia_url
            FROM landmark_localizations
            WHERE landmark_id = ? AND language = ?
            """,
            (landmark['id'], language),
        ).fetchone()
        if row is None and language != 'en':
            row = connection.execute(
                """
                SELECT name, summary, wikipedia_url
                FROM landmark_localizations
                WHERE landmark_id = ? AND language = 'en'
                """,
                (landmark['id'],),
            ).fetchone()
    notes = [] if row is None else [{
        'id': f"{landmark['id']}-{language}-wikipedia",
        'author': 'Wikipedia',
        'score': None,
        'comment': row['summary'],
        'source': row['wikipedia_url'],
    }]
    return {
        'mode': 'backend',
        'landmark_id': landmark['id'],
        'landmark_name': row['name'] if row is not None else landmark['name'],
        'average_score': None,
        'review_count': len(notes),
        'reviews': notes,
    }


@app.get('/api/health')
def health():
    return {
        'status': 'ok',
        'mode': 'backend',
        'database_configured': True,
        'account_database': 'postgresql' if _DATABASE_URL else str(_DB_PATH),
    }


@app.post('/api/auth/register')
def register(payload: AuthPayload):
    _init_account_db()
    email = payload.email.strip().lower()
    if '@' not in email or '.' not in email.rsplit('@', 1)[-1]:
        raise HTTPException(status_code=422, detail='Invalid email')
    name = (payload.name or email.split('@', 1)[0]).strip()[:64] or 'Traveler'
    with _DB_LOCK, _connect_db() as connection:
        existing = connection.execute('SELECT email FROM users WHERE email = ?', (email,)).fetchone()
        if existing is not None:
            raise HTTPException(status_code=409, detail='Account already exists')
        salt, digest = _hash_password(payload.password)
        created_at = _now_iso()
        last_login_at = created_at
        token = secrets.token_urlsafe(32)
        connection.execute(
            """
            INSERT INTO users (email, name, salt, password_hash, created_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (email, name, salt, digest, created_at, last_login_at),
        )
        connection.execute(
            'INSERT INTO sessions (token, email, created_at) VALUES (?, ?, ?)',
            (token, email, _now_iso()),
        )
        _add_history(connection, email, 'registered', 'Account created')
        user = {'email': email, 'name': name, 'created_at': created_at, 'last_login_at': last_login_at}
        return {'token': token, 'user': user, 'history': _history_for_email(connection, email), 'plan': None}


@app.post('/api/auth/login')
def login(payload: AuthPayload):
    _init_account_db()
    email = payload.email.strip().lower()
    with _DB_LOCK, _connect_db() as connection:
        user = connection.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        if user is None or not _verify_password(payload.password, user['salt'], user['password_hash']):
            raise HTTPException(status_code=401, detail='Invalid email or password')
        last_login_at = _now_iso()
        token = secrets.token_urlsafe(32)
        connection.execute('UPDATE users SET last_login_at = ? WHERE email = ?', (last_login_at, email))
        connection.execute(
            'INSERT INTO sessions (token, email, created_at) VALUES (?, ?, ?)',
            (token, email, _now_iso()),
        )
        _add_history(connection, email, 'signed in', 'Session started')
        public_user = {
            'email': email,
            'name': user['name'],
            'created_at': user['created_at'],
            'last_login_at': last_login_at,
        }
        return {
            'token': token,
            'user': public_user,
            'history': _history_for_email(connection, email),
            'plan': _plan_for_email(connection, email),
        }


@app.get('/api/auth/me')
def get_me(authorization: str | None = Header(default=None)):
    _, email, user = _require_user(authorization)
    with _DB_LOCK, _connect_db() as connection:
        return {
            'user': _public_user(email, user),
            'history': _history_for_email(connection, email),
            'plan': _plan_for_email(connection, email),
        }


@app.post('/api/auth/logout')
def logout(authorization: str | None = Header(default=None)):
    token, _, _ = _require_user(authorization)
    with _DB_LOCK, _connect_db() as connection:
        connection.execute('DELETE FROM sessions WHERE token = ?', (token,))
    return {'ok': True}


@app.get('/api/account/history')
def get_account_history(authorization: str | None = Header(default=None)):
    _, email, _ = _require_user(authorization)
    with _DB_LOCK, _connect_db() as connection:
        return {'items': _history_for_email(connection, email)}


@app.post('/api/account/history')
def add_account_history(payload: HistoryPayload, authorization: str | None = Header(default=None)):
    _, email, _ = _require_user(authorization)
    with _DB_LOCK, _connect_db() as connection:
        _add_history(connection, email, payload.action, payload.detail)
        return {'items': _history_for_email(connection, email)}


@app.get('/api/account/plan')
def get_account_plan(authorization: str | None = Header(default=None)):
    _, email, _ = _require_user(authorization)
    with _DB_LOCK, _connect_db() as connection:
        return {'plan': _plan_for_email(connection, email)}


@app.put('/api/account/plan')
def save_account_plan(payload: PlanPayload, authorization: str | None = Header(default=None)):
    _, email, _ = _require_user(authorization)
    plan = payload.model_dump()
    with _DB_LOCK, _connect_db() as connection:
        saved = _save_plan(connection, email, plan)
        return {'plan': saved}


@app.get('/api/landmarks')
def get_landmarks():
    return {
        'mode': 'backend',
        'items': LANDMARKS,
    }


@app.get('/api/routes/current')
def get_current_route():
    return {
        'mode': 'backend',
        'route': MOCK_ROUTE,
    }


@app.post('/api/routes/plan')
def plan_route(payload: RoutePlanPayload):
    google_api_key = os.getenv('GOOGLE_MAPS_API_KEY', '').strip()
    if google_api_key:
        try:
            return _plan_google_route(payload.coordinates, google_api_key)
        except (KeyError, RuntimeError, ValueError, urllib.error.URLError):
            pass
    try:
        return _plan_osrm_route(payload.coordinates)
    except (RuntimeError, ValueError, urllib.error.URLError) as error:
        raise HTTPException(status_code=502, detail=f'Route provider failed: {error}') from error


@app.get('/api/landmarks/{landmark_id}/reviews')
def get_landmark_reviews(
    landmark_id: str,
    language: str = Query('en', pattern='^(en|zh)$'),
):
    landmark = _find_landmark(landmark_id)
    if not landmark:
        raise HTTPException(status_code=404, detail=f'Unknown landmark: {landmark_id}')

    return _review_payload(landmark, language)


@app.get('/api/reviews/nearby')
def get_nearby_reviews(
    lon: float = Query(...),
    lat: float = Query(...),
    radius_km: float = Query(50, ge=1, le=500),
    language: str = Query('en', pattern='^(en|zh)$'),
):
    items = []
    for landmark in LANDMARKS:
        distance = _distance_km(lon, lat, landmark['lon'], landmark['lat'])
        if distance > radius_km:
            continue

        review_payload = _review_payload(landmark, language)
        items.append({
            'landmark_id': landmark['id'],
            'landmark_name': landmark['name'],
            'distance_km': round(distance, 2),
            'average_score': review_payload['average_score'],
            'review_count': review_payload['review_count'],
            'source': 'backend',
        })

    items.sort(key=lambda item: item['distance_km'])
    return {
        'mode': 'backend',
        'items': items,
    }
