**Interactive RAG Demo: MongoDB + Voyage AI + Ollama**
======================================================

This repository provides a transparent, step-by-step demonstration of a Retrieval-Augmented Generation (RAG) pipeline. It is designed as an educational tool for developers to understand exactly how data flows and transforms at each stage, from a raw document to a final, cited answer.

**Overview**
------------

This project offers two ways to explore the RAG pipeline:

1.  **Interactive Web Demo**: A user-friendly, single-page web application that allows you to control each step of the process with buttons, read live explanations, and inspect intermediate outputs.
    
2.  **Jupyter Debugging Notebook**: A Python notebook that contains the core backend logic, broken down into individual, runnable cells. It's perfect for deep-diving, debugging, and experimenting with the code.
    

**Features**
------------

*   **Granular Step-by-Step Control**: Manually trigger each stage of the RAG pipeline for both ingestion and querying.
    
*   **Live Explanations**: Each step in the UI includes a clear explanation of what's happening and why it's important.
    
*   **Collapsible Outputs**: View a concise "snippet" of the output for a quick overview, or expand the view to see the full, raw JSON data.
    
*   **Functional Reranking Toggle**: Instantly enable or disable a live API call to a Voyage AI Reranker to see its impact on document relevance.
    
*   **Simple & Portable Stack**: Built with Python (FastAPI), MongoDB Atlas, Voyage AI, Ollama, and vanilla JavaScript for easy setup and understanding.
    

**🚀 Getting Started: Initial Setup**
-------------------------------------

Follow these steps to configure the repository for both the web demo and the notebook.

### **Prerequisites**

1.  **Python 3.8+**: Ensure Python and pip are installed.
    
2.  **Jupyter**: Install JupyterLab via pip:
    
    pip install jupyterlab.
    
3.  **MongoDB Atlas Account**: You'll need a MongoDB Atlas account. The **free M0 cluster is perfectly sufficient** for this demo.
    
4.  **Voyage AI API Key**: Get a free API key from the [Voyage AI Dashboard](https://www.google.com/search?q=https://dash.voyageai.com/api-keys).
    
5.  **Ollama**: Install and run Ollama locally from [ollama.com](https://ollama.com). After installation, you **must pull a model** from your terminal. We recommend Llama 3:

    ollama pull llama3
    

### **Step 1: Clone the Repository**

Clone this project to your local machine and navigate into the directory.

    git clone cd rag-demo

### **Step 2: Configure Environment Variables**

Rename the example environment file from .env.example to .env.

    mv .env.example .env

Now, open the new .env file and add your **MongoDB URI** and **Voyage AI API Key**.

### **Step 3: Install Dependencies**

Install all the required Python packages using the requirements.txt file.

    pip install -r requirements.txt

### **Step 4: Create MongoDB Atlas Indexes (Crucial!)**

For retrieval to work, you must create two separate indexes on your knowledge\_base collection. Navigate to your cluster in Atlas, select the **Search** tab, and use the **JSON Editor** to create the following indexes.

#### **A. Vector Search Index**

*   **Index Name**: vector\_index
    
*   **JSON Configuration**:

    ```JSON
    {  "fields":
        [
            {
                "type": "vector",
                "path": "embedding",
                "numDimensions": 4096,
                "similarity": "cosine"
            }
        ]
    }
    ```

💡 **Note**: The numDimensions is set to **1024** for the voyage-3-large model.
    

#### **B. Text Search Index**

*   **Index Name**: full\_text\_index
    
*   **JSON Configuration**
    ```JSON
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
    ```
    

**💻 Usage Option 1: The Interactive Web Demo**
-----------------------------------------------

This is the best way to get a high-level, visual understanding of the RAG pipeline.

### **Step 1: Run the Application**

Launch the FastAPI server from your terminal.

    uvicorn main:app --reload

### **Step 2: Use the Demo UI**

Open your web browser and navigate to **http://localhost:8000**.

1.  **Ingestion**: Use the controls in the "Document Ingestion" section to upload a .txt or .md file, chunk it, and then embed and store it in your database.
    
2.  **Query**: Type a question into the input field. The first button, "Embed Query," will become active.
    
3.  **Step Through**: Click the button for each step to run it. After a step completes successfully, the button for the next step in the sequence will become active.
    
4.  **Inspect**: Read the explanations and inspect the outputs. Use the "Show Full" / "Show Snippet" buttons to toggle between a summary and the full data view.
    

**🧪 Usage Option 2: The Debugging Notebook**
---------------------------------------------

This is the best way to experiment with the code, inspect variables, and debug the pipeline.

### **Step 1: Launch JupyterLab**

In your terminal, from the project's root directory, run:

    jupyter lab

A new tab will open in your browser with the JupyterLab interface.

### **Step 2: Open and Run the Notebook**

1.  In the JupyterLab file browser on the left, find and double-click the .ipynb notebook file.
    
2.  The notebook is divided into cells. You can run a cell by selecting it and clicking the "Run" (▶) button in the toolbar or by pressing Shift + Enter.
    

### **Step 3: How to Use the Notebook**

*   **Run Sequentially**: Run the cells from top to bottom. Each cell represents a step in the pipeline and often depends on variables created in the cells above it.
    
*   **Inspect Outputs**: After running a cell, the output (data, print statements, errors) will appear directly below it. This allows for detailed inspection of data structures at every stage.
    
*   **Experiment**: Feel free to modify the code within the cells. Change the document\_text or user\_query variables to test your own data and see how the pipeline responds.