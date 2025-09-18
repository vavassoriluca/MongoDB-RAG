# Interactive RAG Demo: MongoDB + Voyage AI + Ollama

This project provides a transparent, step-by-step demonstration of a Retrieval-Augmented Generation (RAG) pipeline. It's designed as an educational tool for developers to see exactly how data flows and transforms at each stage, from raw document to final answer.

The entire codebase is provided, so you don't have to write a single line of code to get started.



## Features

-   **Step-by-Step Execution**: Manually trigger each stage of the RAG pipeline for both ingestion and querying.
-   **Transparent Outputs**: View the raw JSON data and API responses at every step.
-   **Interactive Toggles**: Instantly enable or disable Reranking to compare results.
-   **Simple Stack**: Built with Python (FastAPI), MongoDB Atlas, Voyage AI, Ollama, and vanilla JavaScript for maximum portability.
-   **Easy Setup**: Get up and running in minutes with a `.env` file and a single `pip install` command.

## How It Works

### 1. Ingestion Pipeline

1.  **Upload & Chunk**: Upload a `.txt` or `.md` file. The backend splits it into smaller, manageable text chunks.
2.  **Embed & Insert**: Each chunk is sent to the Voyage AI API to create a vector embedding. The chunk text and its corresponding vector are then stored as a document in MongoDB Atlas.

### 2. Query Pipeline

1.  **Embed Query**: Your question is sent to the Voyage AI API to create a query vector.
2.  **Retrieve**: This query vector is used to perform a vector search against the MongoDB collection to find the most similar text chunks.
3.  **Rerank (Optional)**: The retrieved chunks are sent to the Voyage AI Reranker API, which re-orders them based on contextual relevance to the query.
4.  **Construct Prompt**: The top-ranked chunks are combined with your original question into a detailed prompt.
5.  **Generate Answer**: The final prompt is sent to a locally running Ollama model (like Llama 3) to generate a final, synthesized answer.

## 🚀 Getting Started: 5-Minute Setup

### Prerequisites

1.  **Python 3.8+**: Make sure Python and `pip` are installed.
2.  **MongoDB Atlas Account**: You need a free or paid MongoDB Atlas account.
3.  **Voyage AI API Key**: Get a free API key from the [Voyage AI Dashboard](https://dash.voyageai.com/api-keys).
4.  **Ollama**: Install and run Ollama locally. Make sure you've pulled a model:
    ```bash
    # We recommend Llama 3
    ollama pull llama3
    ```

### Step 1: Clone the Repository

Clone this project to your local machine.

```bash
git clone <repository-url>
cd rag-demo
```

### Step 2: Configure Environment Variables

Rename the example environment file and fill in your credentials.

```bash
mv .env.example .env
```

Now, open the `.env` file and add your **MongoDB URI** and **Voyage AI API Key**.

### Step 3: Install Dependencies

Install all the required Python packages.

```bash
pip install -r requirements.txt
```

### Step 4: Create MongoDB Atlas Vector Search Index (Crucial!)

This is the most important setup step. You must create a Vector Search Index in your MongoDB Atlas collection for the retrieval step to work.

1.  Navigate to your cluster in MongoDB Atlas.
2.  Go to the **"Search"** tab.
3.  Click **"Create Search Index"**.
4.  Select the **"JSON Editor"** configuration method.
5.  Select the correct database (`rag_demo_db`) and collection (`knowledge_base`).
6.  Give the index the name `vector_index`.
7.  Paste the following JSON configuration into the editor:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    }
  ]
}
```

**Note**: `numDimensions` is `1024` for the `voyage-large-2-instruct` model used in this demo. If you change the model, you must update this value.

### Step 5: Run the Application

Launch the FastAPI server using Uvicorn.

```bash
uvicorn main:app --reload
```

The server will start, typically on `http://localhost:8000`.

### Step 6: Use the Demo

Open your web browser and navigate to [http://localhost:8000](http://localhost:8000). You can now use the interactive demo to ingest documents and ask questions!