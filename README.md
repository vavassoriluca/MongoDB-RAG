# Interactive RAG Demo: MongoDB + Voyage AI + Ollama

This project is a transparent, step-by-step demonstration of a Retrieval-Augmented Generation (RAG) pipeline. It's designed as an educational tool for developers to see exactly how data flows and transforms at each stage, from a raw document to a final, cited answer.

The entire codebase is provided, so you don't have to write a single line of code to get started.



---
## Features

* **Step-by-Step Execution**: Manually trigger each stage of the RAG pipeline for both ingestion and querying.
* **Transparent Outputs**: View the raw JSON data and API responses at every intermediate step.
* **Interactive Toggles**: Directly compare results with and without key features.
    * **Hybrid Search (Conceptual)**: The UI shows what a hybrid search pipeline looks like to demonstrate the concept. For simplicity, the backend still executes a pure vector search.
    * **Reranking (Fully Functional)**: This toggle is fully implemented, making a live API call to Voyage AI to rerank results and improve relevance.
* **Simple Stack**: Built with Python (FastAPI), MongoDB Atlas, Voyage AI, Ollama, and vanilla JavaScript for maximum portability.

---
## How It Works

The demo is split into two distinct workflows that you control from the UI.

### 1. Ingestion Pipeline (Offline Process)

1.  **Upload & Chunk**: A `.txt` or `.md` file is uploaded and split into smaller, overlapping text chunks.
2.  **Embed & Insert**: Each chunk is sent to the Voyage AI Embeddings API to create a vector. The text and its vector are then stored as a document in MongoDB Atlas.

### 2. Query Pipeline (Real-time Process)

1.  **Embed Query**: Your question is sent to the Voyage AI API to create a query vector.
2.  **Retrieve**: The query vector is used to perform a search against the MongoDB collection to find the most similar text chunks.
3.  **Rerank (Optional)**: The retrieved chunks are sent to the Voyage AI Reranker API, which re-orders them based on contextual relevance to the query.
4.  **Construct Prompt**: The top-ranked chunks are combined with your original question into a detailed prompt for the language model.
5.  **Generate Answer**: The final prompt is sent to a locally running Ollama model (like Llama 3) to generate a final, synthesized answer.

---
## 🚀 Getting Started: 5-Minute Setup

### Prerequisites

1.  **Python 3.8+**: Make sure Python and `pip` are installed on your system.
2.  **MongoDB Atlas Account**: You'll need a MongoDB Atlas account. The **free `M0` cluster is perfectly sufficient** for running this demo.
3.  **Voyage AI API Key**: Get a free API key from the [Voyage AI Dashboard](https://dash.voyageai.com/api-keys).
4.  **Ollama**: Install and run Ollama locally from [ollama.com](https://ollama.com). After installation, you **must pull a model** from your terminal. We recommend Llama 3:
    
    ```bash
    ollama pull llama3
    ```

### Step 1: Clone the Repository

Clone this project to your local machine and navigate into the directory.

    git clone <repository-url>
    cd rag-demo




### Step 2: Configure Environment Variables
Rename the example environment file from .env.example to .env.


    mv .env.example .env


Now, open the new .env file and add your MongoDB URI and Voyage AI API Key.

### Step 3: Install Dependencies
Install all the required Python packages using pip.
    
    pip install -r requirements.txt


### Step 4: Create MongoDB Atlas Indexes (Crucial!)
For the demo to function, you must create two separate indexes on your knowledge_base collection. Navigate to your cluster in Atlas, select the Search tab, and use the JSON Editor to create the following indexes.

A. Vector Search Index
Index Name: vector_index

JSON Configuration:

    {
        "fields": [
            {
                "type": "vector",
                "path": "embedding",
                "numDimensions": 4096,
                "similarity": "cosine"
            }
        ]
    }

💡 Note: The numDimensions is set to 4096 for the voyage-3-large model used in this demo.

B. Text Search Index (for Hybrid Search)
Index Name: full_text_index

JSON Configuration:
    
    {
        "mappings": {
            "dynamic": false,
            "fields": {
                "text": [
                    { "type": "string" },
                    { "type": "stringFacet" }
                ]
            }
        }
    }

### Step 5: Run the Application
Launch the FastAPI server using Uvicorn.

    uvicorn main:app --reload

### Step 6: Use the Demo
Open your web browser and navigate to http://localhost:8000. You can now ingest documents and ask questions!