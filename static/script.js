// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const state = {
        chunks: [],
        source: '',
        queryEmbedding: [],
        retrievedDocs: [],
        rerankedDocs: [],
        finalPrompt: '',
    };

    // --- Element Selectors ---
    const getElem = (id) => document.getElementById(id);

    const elements = {
        // Ingestion
        documentUpload: getElem('documentUpload'),
        runChunkingBtn: getElem('runChunkingBtn'),
        chunkingOutput: getElem('chunkingOutput'),
        runEmbeddingInsertionBtn: getElem('runEmbeddingInsertionBtn'),
        insertionProgress: getElem('insertionProgress'),
        embeddingInsertionOutput: getElem('embeddingInsertionOutput'),
        // Query
        queryInput: getElem('queryInput'),
        hybridSearchToggle: getElem('hybridSearchToggle'),
        rerankingToggle: getElem('rerankingToggle'),
        runQueryBtn: getElem('runQueryBtn'),
        queryEmbeddingOutput: getElem('queryEmbeddingOutput'),
        retrievalOutput: getElem('retrievalOutput'),
        rerankingStep: getElem('rerankingStep'),
        rerankingOutput: getElem('rerankingOutput'),
        promptStepTitle: getElem('promptStepTitle'),
        promptOutput: getElem('promptOutput'),
        generationStepTitle: getElem('generationStepTitle'),
        finalAnswerOutput: getElem('finalAnswerOutput'),
    };

    // --- Helper Functions ---
    const showOutput = (element, data, isJson = true) => {
        const codeElement = element.querySelector('code');
        if (codeElement) {
            codeElement.textContent = isJson ? JSON.stringify(data, null, 2) : data;
        } else {
            element.textContent = isJson ? JSON.stringify(data, null, 2) : data;
        }
    };

    const apiCall = async (endpoint, options) => {
        try {
            const response = await fetch(`/api${endpoint}`, options);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API call to ${endpoint} failed:`, error);
            alert(`Error: ${error.message}`);
            throw error;
        }
    };

    // --- Event Listeners & Logic ---

    // 1. Ingestion Workflow
    elements.runChunkingBtn.addEventListener('click', async () => {
        const file = elements.documentUpload.files[0];
        if (!file) {
            alert('Please select a file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const data = await apiCall('/ingest/chunk', { method: 'POST', body: formData });
            state.chunks = data.chunks;
            state.source = data.source;
            showOutput(elements.chunkingOutput, data);
            elements.runEmbeddingInsertionBtn.disabled = false;
        } catch (error) {
            showOutput(elements.chunkingOutput, { error: error.message });
        }
    });

    elements.runEmbeddingInsertionBtn.addEventListener('click', async () => {
        if (state.chunks.length === 0) {
            alert('Please chunk a document first.');
            return;
        }

        elements.embeddingInsertionOutput.querySelector('code').textContent = '';
        let processedCount = 0;

        for (const chunk of state.chunks) {
            try {
                // Step 1.2a: Embed
                const embedResponse = await apiCall('/ingest/embed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chunk_text: chunk.text }),
                });

                const embedding = embedResponse.api_response.data[0].embedding;
                elements.embeddingInsertionOutput.querySelector('code').textContent += `--- Embedding for Chunk ${chunk.chunk_id} ---\n${JSON.stringify(embedResponse, null, 2)}\n\n`;


                // Step 1.2b: Insert
                const insertResponse = await apiCall('/ingest/insert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: chunk.text,
                        embedding: embedding,
                        source: state.source,
                        chunk_id: chunk.chunk_id,
                    }),
                });
                elements.embeddingInsertionOutput.querySelector('code').textContent += `--- Insertion for Chunk ${chunk.chunk_id} ---\n${JSON.stringify(insertResponse, null, 2)}\n\n`;

                processedCount++;
                elements.insertionProgress.textContent = `Processed ${processedCount} / ${state.chunks.length} chunks.`;

            } catch (error) {
                elements.embeddingInsertionOutput.querySelector('code').textContent += `--- ERROR for Chunk ${chunk.chunk_id} ---\n${JSON.stringify({ error: error.message }, null, 2)}\n\n`;
                break; // Stop on first error
            }
        }
    });

    // 2. Query Workflow
    elements.rerankingToggle.addEventListener('change', () => {
        const isEnabled = elements.rerankingToggle.checked;
        elements.rerankingStep.style.display = isEnabled ? 'block' : 'none';
        elements.promptStepTitle.textContent = isEnabled ? 'Step 2.4: Construct LLM Prompt' : 'Step 2.3: Construct LLM Prompt';
        elements.generationStepTitle.textContent = isEnabled ? 'Step 2.5: Final Generation from LLM' : 'Step 2.4: Final Generation from LLM';
    });
    
    // Trigger the change event on load to set initial state
    elements.rerankingToggle.dispatchEvent(new Event('change'));


    elements.runQueryBtn.addEventListener('click', async () => {
        const query = elements.queryInput.value;
        if (!query) {
            alert('Please enter a query.');
            return;
        }

        const useHybridSearch = elements.hybridSearchToggle.checked;
        const useReranking = elements.rerankingToggle.checked;

        try {
            // Step 2.1: Embed Query
            const embedData = await apiCall('/query/embed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            state.queryEmbedding = embedData.api_response.data[0].embedding;
            showOutput(elements.queryEmbeddingOutput, embedData);

            // Step 2.2: Retrieve
            const retrieveData = await apiCall('/query/retrieve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query_embedding: state.queryEmbedding,
                    use_hybrid_search: useHybridSearch
                }),
            });
            state.retrievedDocs = retrieveData.results;
            showOutput(elements.retrievalOutput, retrieveData);
            
            let docsForPrompt = state.retrievedDocs;

            // Step 2.3 (Conditional): Rerank
            if (useReranking) {
                const rerankData = await apiCall('/query/rerank', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ query, documents: state.retrievedDocs }),
                });
                showOutput(elements.rerankingOutput, rerankData);
                
                // Re-order the original documents based on the reranker's response
                state.rerankedDocs = rerankData.api_response.results.map(rerankedItem => {
                    // Find the original document that corresponds to the reranked index
                    const originalDoc = state.retrievedDocs[rerankedItem.index];
                    // Add the new relevance score to it
                    return { ...originalDoc, rerank_score: rerankedItem.relevance_score };
                });
                docsForPrompt = state.rerankedDocs;
            }

            // Step 2.4: Build Prompt
            const promptData = await apiCall('/query/build-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, documents: docsForPrompt }),
            });
            state.finalPrompt = promptData.prompt;
            showOutput(elements.promptOutput, state.finalPrompt, false);

            // Step 2.5: Generate Final Answer
            const generateData = await apiCall('/query/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: state.finalPrompt }),
            });
            showOutput(elements.finalAnswerOutput, generateData.final_answer, false);


        } catch (error) {
            // Error is already alerted in apiCall, just log it
            console.error('Full query pipeline failed:', error);
        }
    });

});