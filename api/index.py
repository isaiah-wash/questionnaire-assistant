"""
FastAPI Backend for Questionnaire Assistant
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from document_parser import DocumentParser, QAPair
from knowledge_base import KnowledgeBase
from embeddings import SimpleEmbeddings
from answer_generator import AnswerGenerator
from exporter import QuestionnaireExporter

load_dotenv()

# Initialize components
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    print("Warning: ANTHROPIC_API_KEY not set. Some features will not work.")

# Use /tmp for Vercel serverless (writable directory)
# Note: Data won't persist between function invocations
DATA_DIR = Path("/tmp/data")
DATA_DIR.mkdir(exist_ok=True)

kb = KnowledgeBase(str(DATA_DIR / "knowledge.db"))
embeddings = SimpleEmbeddings()
exporter = QuestionnaireExporter()

# Initialize parser and generator only if API key is available
parser = DocumentParser(ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
generator = AnswerGenerator(ANTHROPIC_API_KEY, kb) if ANTHROPIC_API_KEY else None

app = FastAPI(title="Questionnaire Assistant", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models
class QuestionInput(BaseModel):
    question: str


class QuestionsInput(BaseModel):
    questions: list[str]


class QAInput(BaseModel):
    question: str
    answer: str
    source_file: str = "manual"
    category: str = ""


# Routes
@app.get("/")
async def root():
    """API root endpoint."""
    return {"message": "Questionnaire Assistant API", "docs": "/docs"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "api_key_configured": ANTHROPIC_API_KEY is not None,
    }


@app.get("/api/stats")
async def get_stats():
    """Get knowledge base statistics."""
    return kb.get_stats()


@app.get("/api/knowledge")
async def get_knowledge():
    """Get all Q&A pairs from knowledge base."""
    qa_pairs = kb.get_all()
    return {
        "count": len(qa_pairs),
        "pairs": [
            {
                "id": qa.id,
                "question": qa.question,
                "answer": qa.answer,
                "source_file": qa.source_file,
                "category": qa.category,
            }
            for qa in qa_pairs
        ],
    }


@app.get("/api/sources")
async def get_sources():
    """Get list of all source files."""
    return {"sources": kb.get_sources()}


@app.post("/api/knowledge/add")
async def add_qa_pair(qa: QAInput):
    """Manually add a Q&A pair."""
    embedding = embeddings.generate_embedding(qa.question)
    qa_id = kb.add_qa_pair(
        question=qa.question,
        answer=qa.answer,
        source_file=qa.source_file,
        category=qa.category,
        embedding=embedding,
    )
    return {"id": qa_id, "message": "Q&A pair added successfully"}


@app.post("/api/upload-knowledge")
async def upload_knowledge(file: UploadFile = File(...)):
    """Upload a completed questionnaire to add to knowledge base."""
    if not parser:
        raise HTTPException(
            status_code=500, detail="API key not configured. Cannot parse documents."
        )

    # Read file content
    content = await file.read()
    filename = file.filename

    # Parse the document
    try:
        qa_pairs = parser.parse_file(filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing document: {str(e)}")

    if not qa_pairs:
        raise HTTPException(
            status_code=400, detail="No Q&A pairs found in document"
        )

    # Generate embeddings and add to knowledge base
    added_ids = []
    for qa in qa_pairs:
        embedding = embeddings.generate_embedding(qa.question)
        qa_id = kb.add_qa_pair(
            question=qa.question,
            answer=qa.answer,
            source_file=qa.source_file,
            category=qa.category,
            embedding=embedding,
        )
        added_ids.append(qa_id)

    return {
        "message": f"Successfully added {len(added_ids)} Q&A pairs from {filename}",
        "count": len(added_ids),
        "source_file": filename,
    }


@app.post("/api/fill-questionnaire")
async def fill_questionnaire(file: UploadFile = File(...)):
    """Upload a new questionnaire and get auto-filled answers."""
    if not parser or not generator:
        raise HTTPException(
            status_code=500, detail="API key not configured. Cannot process documents."
        )

    # Read file content
    content = await file.read()
    filename = file.filename

    # Parse the document to extract questions (even if answers are empty)
    try:
        qa_pairs = parser.parse_file(filename, content, extract_questions_only=True)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing document: {str(e)}")

    # Extract just the questions (answers may be empty or placeholder)
    questions = [qa.question for qa in qa_pairs]

    if not questions:
        raise HTTPException(status_code=400, detail="No questions found in document")

    # Generate answers for each question
    results = generator.fill_questionnaire(questions)

    # Calculate summary stats
    high_confidence = sum(1 for r in results if r["confidence"] >= 80)
    medium_confidence = sum(1 for r in results if 50 <= r["confidence"] < 80)
    low_confidence = sum(1 for r in results if r["confidence"] < 50)
    needs_review = sum(1 for r in results if r["needs_review"])

    return {
        "filename": filename,
        "total_questions": len(results),
        "summary": {
            "high_confidence": high_confidence,
            "medium_confidence": medium_confidence,
            "low_confidence": low_confidence,
            "needs_review": needs_review,
        },
        "results": results,
    }


@app.post("/api/answer-question")
async def answer_single_question(input: QuestionInput):
    """Get an answer for a single question."""
    if not generator:
        raise HTTPException(
            status_code=500, detail="API key not configured. Cannot generate answers."
        )

    answer = generator.generate_answer(input.question)

    return {
        "question": answer.question,
        "suggested_answer": answer.suggested_answer,
        "confidence": answer.confidence,
        "needs_review": answer.needs_review,
        "source_questions": answer.source_questions,
        "reasoning": answer.reasoning,
    }


@app.delete("/api/knowledge/source/{source_file}")
async def delete_source(source_file: str):
    """Delete all Q&A pairs from a specific source file."""
    deleted = kb.delete_by_source(source_file)
    return {"message": f"Deleted {deleted} Q&A pairs from {source_file}"}


@app.delete("/api/knowledge/clear")
async def clear_knowledge():
    """Clear all Q&A pairs from knowledge base."""
    kb.clear_all()
    return {"message": "Knowledge base cleared"}


@app.post("/api/export")
async def export_questionnaire(
    file: UploadFile = File(...),
    answers: str = Form(...)
):
    """Export filled questionnaire to the original format."""
    import json

    print(f"Export request received for file: {file.filename}")

    # Read the original file
    template_content = await file.read()
    template_filename = file.filename

    # Parse the answers JSON
    try:
        filled_answers = json.loads(answers)
        print(f"Parsed {len(filled_answers)} answers")
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        raise HTTPException(status_code=400, detail="Invalid answers JSON")

    # Export the filled questionnaire
    try:
        print(f"Exporting to format: {Path(template_filename).suffix}")
        content, content_type = exporter.export(
            template_content, template_filename, filled_answers
        )

        # Generate output filename
        output_filename = f"filled_{template_filename}"

        print(f"Export successful, sending {len(content)} bytes")
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"'
            }
        )
    except Exception as e:
        print(f"Export error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
