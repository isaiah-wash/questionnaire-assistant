"""
Answer Generator Module
Uses Claude to generate answers based on similar Q&A pairs from knowledge base.
"""

import json
import re
from dataclasses import dataclass

from anthropic import Anthropic

from knowledge_base import KnowledgeBase, StoredQA
from embeddings import SimpleEmbeddings


@dataclass
class GeneratedAnswer:
    question: str
    suggested_answer: str
    confidence: int  # 0-100
    needs_review: bool
    source_questions: list[dict]  # Similar questions that informed the answer
    reasoning: str


class AnswerGenerator:
    def __init__(self, anthropic_api_key: str, knowledge_base: KnowledgeBase):
        self.client = Anthropic(api_key=anthropic_api_key)
        self.kb = knowledge_base
        self.embeddings = SimpleEmbeddings()

    def generate_answer(self, question: str) -> GeneratedAnswer:
        """Generate an answer for a question using the knowledge base."""
        # Get embedding for the question
        query_embedding = self.embeddings.generate_embedding(question)

        # Search for similar questions
        similar = self.kb.search_similar(query_embedding, top_k=5)

        # Format similar Q&A pairs for context
        context_pairs = []
        for qa, similarity in similar:
            context_pairs.append(
                {
                    "question": qa.question,
                    "answer": qa.answer,
                    "source": qa.source_file,
                    "similarity": round(similarity * 100, 1),
                }
            )

        # If no similar questions found, return low confidence
        if not context_pairs:
            return GeneratedAnswer(
                question=question,
                suggested_answer="",
                confidence=0,
                needs_review=True,
                source_questions=[],
                reasoning="No similar questions found in knowledge base.",
            )

        # Use Claude to generate an answer
        return self._generate_with_claude(question, context_pairs)

    def _generate_with_claude(
        self, question: str, similar_pairs: list[dict]
    ) -> GeneratedAnswer:
        """Use Claude to synthesize an answer from similar Q&A pairs."""
        context = "\n\n".join(
            [
                f"Similar Question (similarity: {p['similarity']}%):\nQ: {p['question']}\nA: {p['answer']}\nSource: {p['source']}"
                for p in similar_pairs
            ]
        )

        prompt = f"""You are helping fill out a due diligence/compliance questionnaire.
Based on the similar questions and answers from previously completed questionnaires,
generate an appropriate answer for the new question.

Previously answered similar questions:
{context}

New question to answer:
{question}

Provide your response as a JSON object with these fields:
- "answer": The suggested answer (keep the same style/format as the source answers)
- "confidence": A number 0-100 indicating how confident you are (100 = exact match exists, 50 = related info found, 0 = guessing)
- "reasoning": Brief explanation of how you derived this answer
- "needs_review": true if a human should verify this answer, false if high confidence

Return ONLY valid JSON, no other text."""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}],
            )

            result_text = response.content[0].text.strip()

            # Parse JSON response
            if result_text.startswith("{"):
                result = json.loads(result_text)
            else:
                match = re.search(r"\{.*\}", result_text, re.DOTALL)
                if match:
                    result = json.loads(match.group())
                else:
                    raise ValueError("No JSON found in response")

            confidence = int(result.get("confidence", 50))

            return GeneratedAnswer(
                question=question,
                suggested_answer=result.get("answer", ""),
                confidence=confidence,
                needs_review=result.get("needs_review", confidence < 70),
                source_questions=similar_pairs,
                reasoning=result.get("reasoning", ""),
            )

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            # Fallback: use the best matching answer directly
            if similar_pairs:
                best_match = similar_pairs[0]
                return GeneratedAnswer(
                    question=question,
                    suggested_answer=best_match["answer"],
                    confidence=int(best_match["similarity"]),
                    needs_review=True,
                    source_questions=similar_pairs,
                    reasoning=f"Direct match from: {best_match['source']}",
                )
            else:
                return GeneratedAnswer(
                    question=question,
                    suggested_answer="",
                    confidence=0,
                    needs_review=True,
                    source_questions=[],
                    reasoning=f"Error generating answer: {str(e)}",
                )

    def generate_answers_batch(self, questions: list[str]) -> list[GeneratedAnswer]:
        """Generate answers for multiple questions."""
        return [self.generate_answer(q) for q in questions]

    def fill_questionnaire(
        self, questions: list[str]
    ) -> list[dict]:
        """
        Fill an entire questionnaire.
        Returns list of dicts with question, answer, confidence, needs_review.
        """
        results = []

        for question in questions:
            answer = self.generate_answer(question)
            results.append(
                {
                    "question": question,
                    "suggested_answer": answer.suggested_answer,
                    "confidence": answer.confidence,
                    "needs_review": answer.needs_review,
                    "source_questions": answer.source_questions,
                    "reasoning": answer.reasoning,
                }
            )

        return results
