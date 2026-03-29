from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    servers=[{"url": "http://localhost:8000", "description": "Local development server"}]
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # * is a wildcard, tells server to accept requests from any website
    allow_credentials=True, # allows frontend to send cookies or ligon information of we add a "login" feature later
    allow_methods=["*"], # tells browser its okay to get(read data) post(to send data), and deletece, etc
    allow_headers=["*"], #allows frontend to send custom information in the "header" of the request (like API)
)

@app.get("/")
def read_root():
    return {"message": "Hello World! Your AI Backend is LIVE 🚀"}

@app.get("/status")
def get_status():
    return {"status": "Connected to WatsonX", "version": "1.0.0"}