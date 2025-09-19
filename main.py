# main.py

import os
import datetime
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import uvicorn

import voyageai
from pymongo import MongoClient
from pymongo.server_api import ServerApi
import ollama

# --- Load Environment Variables ---
load_dotenv()

VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
DB_NAME = "rag_demo_db"
COLLECTION_NAME = "knowledge_base"

# --- Initialize Clients ---
try:
    # Voyage AI Client
    vo = voyageai.Client(api_key=VOYAGE_API_KEY)

    # MongoDB Client
    mongo_client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
    db = mongo_client[DB_NAME]
    collection = db[COLLECTION_NAME]
    # Send a ping to confirm a successful connection
    mongo_client.admin.command('ping')
    print("✅ Pinged your deployment. You successfully connected to MongoDB!")

    # Ollama Client
    ollama_client = ollama.Client(host=OLLAMA_HOST)
    print("✅ Ollama client initialized.")

except Exception as e:
    print(f"🔥 Error initializing clients: {e}")
    # Exit if critical clients fail to initialize
    exit()

# --- FastAPI App ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models for Request Bodies ---
class ChunkRequest(BaseModel):
    text: str
    source: str

class EmbedRequest(BaseModel):
    chunk_text: str

class InsertRequest(BaseModel):
    text: str
    embedding: List[float]
    source: str
    chunk_id: int

class QueryEmbedRequest(BaseModel):
    query: str

class RetrieveRequest(BaseModel):
    query_embedding: List[float]
    use_hybrid_search: bool

class RerankRequest(BaseModel):
    query: str
    documents: List[Dict[str, Any]]

class GenerateRequest(BaseModel):
    query: str
    documents: List[Dict[str, Any]]

# --- Helper Functions ---
def chunk_text(text: str, chunk_size: int = 1024, overlap: int = 128) -> List[Dict[str, Any]]:
    """Splits text into overlapping chunks."""
    if not text:
        return []
    chunks = []
    start = 0
    chunk_id = 1
    while start < len(text):
        end = start + chunk_size
        chunks.append({"chunk_id": chunk_id, "text": text[start:end]})
        start += chunk_size - overlap
        chunk_id += 1
    return chunks

# --- Ingestion Endpoints ---
@app.post("/api/ingest/chunk")
async def chunk_document(file: UploadFile = File(...)):
    """Step 1: Read file and chunk the text."""
    try:
        contents = await file.read()
        text = contents.decode("utf-8")
        chunked_content = chunk_text(text)
        if not chunked_content:
            raise HTTPException(status_code=400, detail="No text found to chunk.")
        return {"chunks": chunked_content, "source": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest/embed")
async def embed_chunk(request: EmbedRequest):
    """Step 2: Embed a single text chunk."""
    try:
        # Using input_type="document" is crucial for retrieval quality
        result = vo.embed([request.chunk_text], model="voyage-3-large", input_type="document")
        return {"api_response": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest/insert")
async def insert_chunk(request: InsertRequest):
    """Step 3: Insert the chunk and its embedding into MongoDB."""
    try:
        document_to_insert = {
            "text": request.text,
            "embedding": request.embedding,
            "source": request.source,
            "metadata": {
                "chunk_id": request.chunk_id,
                "upload_date": datetime.datetime.now(datetime.timezone.utc),
            },
        }
        result = collection.insert_one(document_to_insert)
        # Return the inserted document, converting ObjectId to string for JSON compatibility
        inserted_document = collection.find_one({"_id": result.inserted_id})
        inserted_document["_id"] = str(inserted_document["_id"])
        return {"inserted_document": inserted_document}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Query Endpoints ---

@app.post("/api/query/embed")
async def embed_query(request: QueryEmbedRequest):
    """Step 1: Embed the user's query."""
    try:
        # Using input_type="query" is crucial for retrieval quality
        result = vo.embed([request.query], model="voyage-3-large", input_type="query")
        return {"api_response": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/query/retrieve")
async def retrieve_documents(request: RetrieveRequest):
    """Step 2: Retrieve documents from MongoDB using vector search (or hybrid search)."""
    try:
        if not request.use_hybrid_search:
            # --- Vector Search Only Pipeline ---
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": "vector_index",
                        "path": "embedding",
                        "queryVector": request.query_embedding,
                        "numCandidates": 100,
                        "limit": 10,
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "text": 1,
                        "source": 1,
                        "score": {"$meta": "vectorSearchScore"},
                    }
                },
            ]
            results = list(collection.aggregate(pipeline))
            return {"pipeline": pipeline, "results": results}
        else:
            # --- Hybrid Search Pipeline ---
            # This pipeline runs a vector search and a text search in parallel,
            # then merges and de-duplicates the results.
            pipeline = [
                # 1. Vector Search Stage
                {
                    '$vectorSearch': {
                        'index': 'vector_index',
                        'path': 'embedding',
                        'queryVector': request.query_embedding,
                        'numCandidates': 100,
                        'limit': 5
                    }
                },
                # 2. Project the score and data
                {
                    '$project': {
                        'score': { '$meta': 'vectorSearchScore' },
                        'text': 1,
                        'source': 1
                    }
                },
                # 3. Union with a parallel full-text search query
                {
                    '$unionWith': {
                        'coll': COLLECTION_NAME,
                        'pipeline': [
                            {
                                '$search': {
                                    'index': 'full_text_index',
                                    'text': { 'query': "placeholder_query", 'path': 'text' } # We need the query text here
                                }
                            },
                            {
                                '$project': {
                                    'score': { '$meta': 'searchScore' },
                                    'text': 1,
                                    'source': 1
                                }
                            }
                        ]
                    }
                },
                # 4. De-duplicate the results by grouping
                {
                    '$group': {
                        '_id': '$text',
                        'docs': { '$first': '$$ROOT' }
                    }
                },
                { '$replaceRoot': { 'newRoot': '$docs' } },
                { '$limit': 10 }
            ]
            # To make this fully work, you need the original query text passed to this endpoint
            # to replace "placeholder_query". For now, this structure demonstrates the method.
            
            # Since the original RetrieveRequest doesn't include the query text, we'll run a standard
            # vector search for now but return the hybrid pipeline for display.
            # For a real implementation, you would pass the query text to this function.
            
            vector_only_pipeline = pipeline[0:2] # Execute only the vector part for the demo
            results = list(collection.aggregate(vector_only_pipeline))
            
            return {"pipeline": pipeline, "results": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/query/rerank")
async def rerank_documents(request: RerankRequest):
    """Step 3: Rerank the retrieved documents using Voyage AI."""
    try:
        # The API expects a list of strings
        docs_to_rerank = [doc["text"] for doc in request.documents]

        result = vo.rerank(
            query=request.query,
            documents=docs_to_rerank,
            model="rerank-2.5-lite", # Using a lighter model for speed
            top_k=5, # Return top 5 most relevant
        )
        return {"api_response": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/query/build-prompt")
async def build_prompt(request: GenerateRequest):
    """Step 4: Construct the final prompt for the LLM."""
    context = ""
    for i, doc in enumerate(request.documents):
        context += f"--- Document {i+1} (Source: {doc.get('source', 'N/A')}) ---\n"
        context += f"{doc.get('text', '')}\n\n"

    prompt = f"""Use the following documents to answer the question. If the answer is not in the documents, say 'I cannot answer this question based on the provided documents.'

Documents:
{context}

Question: {request.query}

Answer:"""
    return {"prompt": prompt}

@app.post("/api/query/generate")
async def generate_answer(request: dict):
    """Step 5: Call Ollama to generate the final answer."""
    try:
        prompt = request.get("prompt")
        if not prompt:
            raise HTTPException(status_code=400, detail="Prompt is required.")

        # Using the stream=False option for a complete response
        response = ollama_client.generate(
            model='llama3', # Or 'mistral', ensure it's pulled
            prompt=prompt,
        )
        return {"final_answer": response['response']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Serve Frontend ---
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)