"""
Graph Memory Service
- Extracts entities and relations from text using LLM
- Stores them in a local SQLite database
- Provides neighborhood-based retrieval for RAG
"""

import json
import re
import sqlite3
from pathlib import Path
from datetime import datetime
from app.llm.registry import get_llm

SANDBOX_DIR = Path("/tmp/agentforge")
SANDBOX_DIR.mkdir(exist_ok=True)
DB_PATH = SANDBOX_DIR / "graph_memory.db"

def initialize_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS entities (
            name TEXT PRIMARY KEY,
            type TEXT,
            description TEXT,
            last_seen TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT,
            target TEXT,
            type TEXT,
            description TEXT,
            created_at TEXT,
            UNIQUE(source, target, type)
        )
    """)
    conn.commit()
    conn.close()

async def extract_from_text(text: str, model: str, api_key: str = None) -> str:
    """Extract entities/relations from text and save to DB. Returns summary."""
    if not text.strip():
        return "No text provided for extraction."

    llm = get_llm(model, api_key=api_key)
    prompt = f"""
Extract all key entities and their relationships from the following text.
Respond ONLY with a valid JSON object in this format:
{{
  "entities": [{{ "name": "...", "type": "...", "description": "..." }}],
  "relations": [{{ "source": "...", "target": "...", "type": "...", "description": "..." }}]
}}

Text:
{text}
"""
    response = await llm.chat([{"role": "user", "content": prompt}], temperature=0.1)
    
    # Basic JSON cleanup (strip markdown fences and conversational filler)
    clean = re.sub(r"```[a-z]*\n?", "", response).strip()
    # If the LLM still returns text before/after the JSON, try to find the JSON block
    match = re.search(r"(\{.*\})", clean, re.DOTALL)
    if match:
        clean = match.group(1)
    
    try:
        data = json.loads(clean)
    except Exception as e:
        return f"Failed to parse LLM extraction: {e}. Raw: {response[:100]}"

    entities = data.get("entities", [])
    relations = data.get("relations", [])

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()

    # Upsert entities
    for ent in entities:
        name = ent.get("name")
        if not name: continue
        cursor.execute("""
            INSERT INTO entities (name, type, description, last_seen)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                type = excluded.type,
                description = excluded.description,
                last_seen = excluded.last_seen
        """, (name, ent.get("type"), ent.get("description"), now))

    # Insert relations
    for rel in relations:
        src = rel.get("source")
        tgt = rel.get("target")
        rtype = rel.get("type")
        if not src or not tgt: continue
        cursor.execute("""
            INSERT OR IGNORE INTO relations (source, target, type, description, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (src, tgt, rtype, rel.get("description"), now))

    conn.commit()
    conn.close()

    return f"Extracted {len(entities)} entities and {len(relations)} relations."

async def search_graph(query: str, depth: int, model: str, api_key: str = None) -> str:
    """Identify anchor entities and fetch their neighborhood."""
    llm = get_llm(model, api_key=api_key)
    
    # 1. Get all existing entities to help the LLM identify matches
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM entities")
    known_entities = [r[0] for r in cursor.fetchall()]
    
    if not known_entities:
        conn.close()
        return "Graph memory is empty."

    # 2. Ask LLM to pick relevant anchor entities from the query
    prompt = f"""
Given the user query, identify which of the following 'known entities' are most relevant.
Respond with ONLY a JSON array of names.

Query: {query}
Known Entities: {", ".join(known_entities[:100])}
"""
    response = await llm.chat([{"role": "user", "content": prompt}], temperature=0.1)
    clean = re.sub(r"```[a-z]*\n?", "", response).strip()
    try:
        anchors = json.loads(clean)
        if not isinstance(anchors, list): anchors = []
    except:
        anchors = []

    if not anchors:
        # Fallback: simple keyword match
        anchors = [e for e in known_entities if e.lower() in query.lower()]

    if not anchors:
        conn.close()
        return "No relevant entities found in graph memory."

    # 3. Traverse neighborhood
    results = []
    seen_entities = set()
    to_visit = anchors
    
    for d in range(depth):
        if not to_visit: break
        placeholders = ",".join(["?"] * len(to_visit))
        
        # Get relations involving these entities
        cursor.execute(f"""
            SELECT source, target, type, description FROM relations
            WHERE source IN ({placeholders}) OR target IN ({placeholders})
        """, to_visit + to_visit)
        
        rels = cursor.fetchall()
        next_visit = []
        for src, tgt, rtype, rdesc in rels:
            line = f"- {src} ({rtype}) {tgt}"
            if rdesc: line += f": {rdesc}"
            if line not in results:
                results.append(line)
            
            for e in [src, tgt]:
                if e not in seen_entities:
                    seen_entities.add(e)
                    next_visit.append(e)
        to_visit = next_visit

    # 4. Get entity descriptions
    if seen_entities:
        placeholders = ",".join(["?"] * len(seen_entities))
        cursor.execute(f"SELECT name, type, description FROM entities WHERE name IN ({placeholders})", list(seen_entities))
        ents = cursor.fetchall()
        ent_desc = [f"* {n} ({t}): {d}" for n, t, d in ents if d]
        if ent_desc:
            results = ["Entity Definitions:"] + ent_desc + ["", "Relationships:"] + results

    conn.close()
    return "\n".join(results) if results else "No specific relationships found for identified entities."

def get_graph_data():
    """Return data for visualization."""
    if not DB_PATH.exists():
        return {"nodes": [], "edges": []}
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name, type, description FROM entities")
    nodes = [{"id": n, "label": n, "group": t, "desc": d} for n, t, d in cursor.fetchall()]
    
    cursor.execute("SELECT source, target, type FROM relations")
    edges = [{"source": s, "target": t, "label": r} for s, t, r in cursor.fetchall()]
    conn.close()
    return {"nodes": nodes, "edges": edges}

def clear_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    initialize_db()

# Ensure DB exists on import
initialize_db()
