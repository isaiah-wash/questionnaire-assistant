"""
Knowledge Base Module
Stores and retrieves Q&A pairs with embeddings for semantic search.
"""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class StoredQA:
    id: int
    question: str
    answer: str
    source_file: str
    category: str
    embedding: list[float] | None = None


class KnowledgeBase:
    def __init__(self, db_path: str = "data/knowledge.db"):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Initialize the SQLite database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS qa_pairs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                source_file TEXT,
                category TEXT,
                embedding TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_source_file ON qa_pairs(source_file)
        """)

        conn.commit()
        conn.close()

    def add_qa_pair(
        self,
        question: str,
        answer: str,
        source_file: str,
        category: str = "",
        embedding: list[float] | None = None,
    ) -> int:
        """Add a Q&A pair to the knowledge base."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        embedding_json = json.dumps(embedding) if embedding else None

        cursor.execute(
            """
            INSERT INTO qa_pairs (question, answer, source_file, category, embedding)
            VALUES (?, ?, ?, ?, ?)
        """,
            (question, answer, source_file, category, embedding_json),
        )

        qa_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return qa_id

    def add_qa_pairs_batch(self, qa_pairs: list[dict]) -> list[int]:
        """Add multiple Q&A pairs efficiently."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        ids = []
        for qa in qa_pairs:
            embedding_json = (
                json.dumps(qa.get("embedding")) if qa.get("embedding") else None
            )

            cursor.execute(
                """
                INSERT INTO qa_pairs (question, answer, source_file, category, embedding)
                VALUES (?, ?, ?, ?, ?)
            """,
                (
                    qa["question"],
                    qa["answer"],
                    qa.get("source_file", ""),
                    qa.get("category", ""),
                    embedding_json,
                ),
            )
            ids.append(cursor.lastrowid)

        conn.commit()
        conn.close()

        return ids

    def update_embedding(self, qa_id: int, embedding: list[float]):
        """Update the embedding for a Q&A pair."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute(
            """
            UPDATE qa_pairs SET embedding = ? WHERE id = ?
        """,
            (json.dumps(embedding), qa_id),
        )

        conn.commit()
        conn.close()

    def get_all(self) -> list[StoredQA]:
        """Get all Q&A pairs."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id, question, answer, source_file, category, embedding FROM qa_pairs"
        )
        rows = cursor.fetchall()
        conn.close()

        return [
            StoredQA(
                id=row[0],
                question=row[1],
                answer=row[2],
                source_file=row[3],
                category=row[4],
                embedding=json.loads(row[5]) if row[5] else None,
            )
            for row in rows
        ]

    def get_by_source(self, source_file: str) -> list[StoredQA]:
        """Get all Q&A pairs from a specific source file."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id, question, answer, source_file, category, embedding FROM qa_pairs WHERE source_file = ?",
            (source_file,),
        )
        rows = cursor.fetchall()
        conn.close()

        return [
            StoredQA(
                id=row[0],
                question=row[1],
                answer=row[2],
                source_file=row[3],
                category=row[4],
                embedding=json.loads(row[5]) if row[5] else None,
            )
            for row in rows
        ]

    def search_similar(
        self, query_embedding: list[float], top_k: int = 5
    ) -> list[tuple[StoredQA, float]]:
        """
        Search for similar questions using cosine similarity.
        Returns list of (StoredQA, similarity_score) tuples.
        """
        all_qa = self.get_all()

        # Filter to only those with embeddings
        qa_with_embeddings = [qa for qa in all_qa if qa.embedding]

        if not qa_with_embeddings:
            return []

        # Compute cosine similarities
        query_vec = np.array(query_embedding)
        query_norm = np.linalg.norm(query_vec)

        similarities = []
        for qa in qa_with_embeddings:
            qa_vec = np.array(qa.embedding)
            qa_norm = np.linalg.norm(qa_vec)

            if query_norm > 0 and qa_norm > 0:
                similarity = np.dot(query_vec, qa_vec) / (query_norm * qa_norm)
                similarities.append((qa, float(similarity)))

        # Sort by similarity descending
        similarities.sort(key=lambda x: x[1], reverse=True)

        return similarities[:top_k]

    def get_sources(self) -> list[str]:
        """Get list of all unique source files."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT DISTINCT source_file FROM qa_pairs")
        rows = cursor.fetchall()
        conn.close()

        return [row[0] for row in rows if row[0]]

    def get_stats(self) -> dict:
        """Get statistics about the knowledge base."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM qa_pairs")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT source_file) FROM qa_pairs")
        sources = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM qa_pairs WHERE embedding IS NOT NULL")
        with_embeddings = cursor.fetchone()[0]

        conn.close()

        return {
            "total_qa_pairs": total,
            "source_files": sources,
            "with_embeddings": with_embeddings,
        }

    def delete_by_source(self, source_file: str) -> int:
        """Delete all Q&A pairs from a specific source file."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("DELETE FROM qa_pairs WHERE source_file = ?", (source_file,))
        deleted = cursor.rowcount

        conn.commit()
        conn.close()

        return deleted

    def clear_all(self):
        """Delete all Q&A pairs."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("DELETE FROM qa_pairs")

        conn.commit()
        conn.close()
