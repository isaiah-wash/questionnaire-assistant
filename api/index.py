from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from Questionnaire Assistant API"}

@app.get("/api/health")
def health():
    return {"status": "healthy"}
