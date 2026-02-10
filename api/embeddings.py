"""
Embeddings Module
Generates embeddings for semantic search using Claude-based feature extraction.
"""

import hashlib
import re
from anthropic import Anthropic


class EmbeddingsGenerator:
    def __init__(self, anthropic_api_key: str):
        self.client = Anthropic(api_key=anthropic_api_key)
        self._cache = {}

    def generate_embedding(self, text: str) -> list[float]:
        """
        Generate a semantic embedding for the given text.
        Uses Claude to extract key concepts and creates a feature vector.
        """
        # Check cache
        cache_key = hashlib.md5(text.encode()).hexdigest()
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Use Claude to extract key concepts
        prompt = f"""Analyze this question/text and extract 20 key semantic features as single words or short phrases.
Focus on: topic, domain, compliance area, data type, security concept, process type.

Text: {text}

Return ONLY a comma-separated list of 20 features, nothing else.
Example: data security, encryption, personal data, GDPR, access control, authentication, ..."""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )

            features_text = response.content[0].text.strip()
            features = [f.strip().lower() for f in features_text.split(",")]

            # Create a simple embedding based on feature hashes
            # This creates a consistent vector representation
            embedding = self._features_to_vector(features)

            self._cache[cache_key] = embedding
            return embedding

        except Exception:
            # Fallback to simple keyword-based embedding
            return self._simple_embedding(text)

    def _features_to_vector(self, features: list[str], dim: int = 256) -> list[float]:
        """Convert features to a fixed-dimension vector using hash-based encoding."""
        vector = [0.0] * dim

        for feature in features:
            # Hash feature to get positions
            h = hashlib.md5(feature.encode()).hexdigest()
            for i in range(0, min(len(h), 8), 2):
                pos = int(h[i : i + 2], 16) % dim
                vector[pos] += 1.0

        # Normalize
        magnitude = sum(v * v for v in vector) ** 0.5
        if magnitude > 0:
            vector = [v / magnitude for v in vector]

        return vector

    def _simple_embedding(self, text: str, dim: int = 256) -> list[float]:
        """Simple fallback embedding based on word hashing."""
        # Tokenize
        words = re.findall(r"\b\w+\b", text.lower())

        vector = [0.0] * dim

        for word in words:
            h = hashlib.md5(word.encode()).hexdigest()
            for i in range(0, 4, 2):
                pos = int(h[i : i + 2], 16) % dim
                vector[pos] += 1.0

        # Normalize
        magnitude = sum(v * v for v in vector) ** 0.5
        if magnitude > 0:
            vector = [v / magnitude for v in vector]

        return vector

    def generate_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        return [self.generate_embedding(text) for text in texts]


class SimpleEmbeddings:
    """
    Simpler embedding approach that doesn't require API calls.
    Uses TF-IDF-like features for faster local operation.
    """

    def __init__(self):
        self.vocab = {}
        self.idf = {}

    def generate_embedding(self, text: str, dim: int = 256) -> list[float]:
        """Generate a simple hash-based embedding."""
        words = re.findall(r"\b\w+\b", text.lower())

        # Remove common stop words
        stop_words = {
            "the",
            "a",
            "an",
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "being",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "may",
            "might",
            "must",
            "shall",
            "can",
            "need",
            "dare",
            "ought",
            "used",
            "to",
            "of",
            "in",
            "for",
            "on",
            "with",
            "at",
            "by",
            "from",
            "as",
            "into",
            "through",
            "during",
            "before",
            "after",
            "above",
            "below",
            "between",
            "under",
            "again",
            "further",
            "then",
            "once",
            "and",
            "but",
            "or",
            "nor",
            "so",
            "yet",
            "both",
            "either",
            "neither",
            "not",
            "only",
            "own",
            "same",
            "than",
            "too",
            "very",
            "just",
            "also",
            "your",
            "you",
            "our",
            "we",
            "they",
            "their",
            "this",
            "that",
            "these",
            "those",
            "what",
            "which",
            "who",
            "whom",
            "how",
            "when",
            "where",
            "why",
            "all",
            "each",
            "every",
            "any",
            "some",
            "no",
            "none",
        }

        words = [w for w in words if w not in stop_words and len(w) > 2]

        vector = [0.0] * dim

        for word in words:
            h = hashlib.md5(word.encode()).hexdigest()
            # Use multiple hash positions for better distribution
            for i in range(0, 8, 2):
                pos = int(h[i : i + 2], 16) % dim
                vector[pos] += 1.0

        # Normalize
        magnitude = sum(v * v for v in vector) ** 0.5
        if magnitude > 0:
            vector = [v / magnitude for v in vector]

        return vector
