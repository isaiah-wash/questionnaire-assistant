# Questionnaire Assistant

AI-powered tool to auto-fill due diligence questionnaires using your previous responses.

## Features

- **Knowledge Base**: Upload completed questionnaires (Excel, CSV, Word, PDF) to build a knowledge base
- **Auto-Fill**: Upload new questionnaires and get AI-generated answers based on your historical responses
- **Confidence Scoring**: Each answer includes a confidence score (High/Medium/Low)
- **Review & Copy**: Review answers, copy individual responses, and download filled questionnaires
- **Export**: Download filled questionnaires in the original format with answers highlighted by confidence

## Setup

### 1. Install Dependencies

```bash
cd questionnaire-assistant
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

Get your API key from: https://console.anthropic.com/

### 3. Run the Application

```bash
python backend/app.py
```

Then open http://127.0.0.1:8000 in your browser.

## Usage

### Building Your Knowledge Base

1. Go to the **Knowledge Base** tab
2. Upload your completed questionnaires (Excel, Word, PDF, CSV)
3. The system extracts Q&A pairs and stores them with semantic embeddings

### Filling a New Questionnaire

1. Go to the **Fill Questionnaire** tab
2. Upload a new questionnaire file
3. Review the auto-filled answers with confidence scores
4. Click **Copy** next to any answer to copy it to clipboard
5. Click **Download Filled Questionnaire** to get the completed file

### Answer Confidence

- **High (80-100%)**: Very similar question found, answer is reliable
- **Medium (50-79%)**: Related questions found, answer synthesized from multiple sources
- **Low (0-49%)**: No good matches, answer is uncertain - **review required**

### Testing Single Questions

Use the **Ask Question** tab to test how the system would answer individual questions.

## File Formats Supported

- **Excel** (.xlsx, .xls): Automatically detects question/answer columns
- **CSV**: Detects question/answer columns
- **Word** (.docx): Extracts from tables and structured text
- **PDF**: Extracts text and identifies Q&A pairs using AI

## How It Works

1. **Document Parsing**: Extracts questions and answers from uploaded documents
2. **Semantic Embeddings**: Creates vector representations of questions for similarity matching
3. **Intelligent Matching**: Finds similar questions from your knowledge base
4. **AI Synthesis**: Uses Claude to generate answers based on your previous responses
5. **Confidence Scoring**: Calculates how confident the system is in each answer

## Privacy & Security

- All data stored locally in SQLite database
- Only question text sent to Claude API for analysis
- No message content stored in logs (minimal incident logging only)
- API keys stored securely in `.env` file (never commit this file!)

## Troubleshooting

**Browser cache issues**: Hard refresh with Ctrl+Shift+R (or Cmd+Shift+R on Mac)

**Download button not working**: Make sure you've uploaded and filled a questionnaire first

**Questions not detected**: Ensure your file has clear question/answer columns or structure

**SSL certificate errors (macOS)**: Run `/Applications/Python\ 3.*/Install\ Certificates.command`

## Project Structure

```
questionnaire-assistant/
├── backend/
│   ├── app.py              # FastAPI server
│   ├── document_parser.py  # File format parsers
│   ├── knowledge_base.py   # SQLite + vector search
│   ├── embeddings.py       # Semantic embeddings
│   ├── answer_generator.py # Claude-powered answer generation
│   └── exporter.py         # Export to original formats
├── frontend/
│   ├── index.html          # Web interface
│   ├── styles.css          # Styling
│   └── app.js              # Frontend logic
├── data/
│   └── knowledge.db        # SQLite database (created on first run)
└── .env                    # Environment variables (create from .env.example)
```

## License

This project uses the Anthropic API. See https://www.anthropic.com/legal for API terms.
