// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const state = {
        // Ingestion
        chunks: [],
        source: '',
        // Query
        query: '',
        useReranking: false,
        queryEmbedding: [],
        retrievedDocs: [],
        rerankedDocs: [],
        finalPrompt: '',
        // Full outputs for toggling
        outputs: {}
    };

    // --- Element Selectors ---
    const getElem = (id) => document.getElementById(id);
    const queryElem = (selector) => document.querySelector(selector);
    const queryAll = (selector) => document.querySelectorAll(selector);

    const elements = {
        // Ingestion
        documentUpload: getElem('documentUpload'),
        runChunkingBtn: getElem('runChunkingBtn'),
        runEmbeddingInsertionBtn: getElem('runEmbeddingInsertionBtn'),
        insertionProgress: getElem('insertionProgress'),
        // Query
        queryInput: getElem('queryInput'),
        rerankingToggle: getElem('rerankingToggle'),
        rerankingStep: getElem('rerankingStep'),
    };

    // --- Helper Functions ---
    const apiCall = async (endpoint, options) => {
        try {
            const response = await fetch(`/api${endpoint}`, options);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            alert(`Error: ${error.message}`);
            throw error;
        }
    };

    const showOutput = (stepName, fullOutput, snippet) => {
        const stepElem = queryElem(`.step[data-step-name="${stepName}"]`);
        if (!stepElem) return;
        
        state.outputs[stepName] = { full: fullOutput, snippet: snippet };

        const outputCodeElem = stepElem.querySelector('pre code');
        if (outputCodeElem) {
            outputCodeElem.textContent = snippet;
        }

        const toggleBtn = stepElem.querySelector('.toggle-view-btn');
        if (toggleBtn) {
            toggleBtn.textContent = 'Show Full';
        }
        stepElem.querySelector('.output-panel')?.setAttribute('data-view', 'snippet');
    };

    // --- Snippet Creation Functions ---
    const createSnippet = (stepName, data) => {
        const fullJson = JSON.stringify(data, null, 2);
        let snippet = '';

        try {
            switch (stepName) {
                case 'chunking':
                    snippet = `Total Chunks: ${data.chunks.length}\n\n--- First Chunk ---\n${JSON.stringify(data.chunks[0], null, 2)}`;
                    break;
                case 'queryEmbedding':
                    snippet = `Model: ${data.api_response.model}\nTokens: ${data.api_response.usage.total_tokens}\nVector Dimensions: ${data.api_response.embeddings[0].length}\n\n"embedding": [\n  ${data.api_response.embeddings[0].slice(0, 5).join(',\n  ')}...\n]`;
                    break;
                case 'retrieval':
                    snippet = `Retrieved Documents: ${data.results.length}\n\n--- Top 2 Results ---\n${JSON.stringify(data.results.slice(0, 2), null, 2)}`;
                    break;
                case 'reranking':
                    snippet = `Model: ${data.api_response.model}\n\n--- Top 2 Reranked Results ---\n${JSON.stringify(data.api_response.results.slice(0, 2), null, 2)}`;
                    break;
                case 'promptConstruction':
                    snippet = data.prompt.substring(0, 250) + '\n\n[...]';
                    break;
                default:
                    snippet = fullJson;
            }
        } catch (e) {
            snippet = 'Could not generate snippet.\n' + fullJson;
        }
        return { full: fullJson, snippet };
    };
    
    // --- Workflow Control ---
    const resetQueryUI = () => {
        queryAll('.query-step').forEach(step => {
            const stepIndex = parseInt(step.dataset.stepIndex);
            step.querySelector('.run-step-btn').disabled = (stepIndex !== 1);
            if (step.dataset.stepName !== 'finalAnswer') {
                 step.querySelector('pre code').textContent = 'Output will appear here...';
            } else {
                 step.querySelector('.final-answer-panel').textContent = 'Final answer will appear here...';
            }
        });
        updateStepTitles();
    };

    const unlockNextStep = (completedStepIndex) => {
        const nextStepIndex = state.useReranking && completedStepIndex === 2 ? 3 :
                              !state.useReranking && completedStepIndex === 2 ? 4 :
                              completedStepIndex + 1;
        
        const nextStepElem = queryElem(`.query-step[data-step-index="${nextStepIndex}"]`);
        if (nextStepElem) {
            nextStepElem.querySelector('.run-step-btn').removeAttribute('disabled');
        }
    };

    const updateStepTitles = () => {
        const useReranking = elements.rerankingToggle.checked;
        const promptStep = queryElem('.step[data-step-name="promptConstruction"]');
        const answerStep = queryElem('.step[data-step-name="finalAnswer"]');
        
        promptStep.querySelector('.step-title').textContent = useReranking ? "Step 2.4: Construct LLM Prompt" : "Step 2.3: Construct LLM Prompt";
        answerStep.querySelector('.step-title').textContent = useReranking ? "Step 2.5: Final Generation from LLM" : "Step 2.4: Final Generation from LLM";
    };

    // --- Event Listeners ---
    elements.rerankingToggle.addEventListener('change', () => {
        state.useReranking = elements.rerankingToggle.checked;
        elements.rerankingStep.style.display = state.useReranking ? 'block' : 'none';
        updateStepTitles();
        // Simple UI reset if toggled mid-flow
        resetQueryUI();
        elements.queryInput.dispatchEvent(new Event('input'));
    });
    
    elements.queryInput.addEventListener('input', () => {
        const query = elements.queryInput.value.trim();
        queryElem('.query-step[data-step-index="1"] .run-step-btn').disabled = !query;
    });

    // Ingestion Listeners
    elements.runChunkingBtn.addEventListener('click', async () => {
        const file = elements.documentUpload.files[0];
        if (!file) return alert('Please select a file to upload.');
        const formData = new FormData();
        formData.append('file', file);
        const data = await apiCall('/ingest/chunk', { method: 'POST', body: formData });
        state.chunks = data.chunks;
        state.source = data.source;
        const { full, snippet } = createSnippet('chunking', data);
        showOutput('chunking', full, snippet);
        elements.runEmbeddingInsertionBtn.disabled = false;
    });

    elements.runEmbeddingInsertionBtn.addEventListener('click', async () => {
        if (state.chunks.length === 0) return alert('Please chunk a document first.');
        let fullLog = '';
        for (const [index, chunk] of state.chunks.entries()) {
            elements.insertionProgress.textContent = `Processing chunk ${index + 1}/${state.chunks.length}...`;
            const embedResponse = await apiCall('/ingest/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chunk_text: chunk.text }) });
            const embedding = embedResponse.api_response.embeddings[0];
            const insertResponse = await apiCall('/ingest/insert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: chunk.text, embedding, source: state.source, chunk_id: chunk.chunk_id }) });
            fullLog += `--- Chunk ${chunk.chunk_id} ---\nEmbedding: ${JSON.stringify(embedResponse, null, 2)}\nInsertion: ${JSON.stringify(insertResponse, null, 2)}\n\n`;
        }
        elements.insertionProgress.textContent = `Processed ${state.chunks.length} chunks.`;
        showOutput('embeddingInsertion', fullLog, `Successfully embedded and inserted ${state.chunks.length} chunks.`);
    });
    
    // Universal Toggle View Listener
    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('toggle-view-btn')) {
            const outputPanel = e.target.closest('.output-panel');
            const stepName = outputPanel.closest('.step').dataset.stepName;
            const isSnippet = outputPanel.dataset.view === 'snippet';

            outputPanel.querySelector('pre code').textContent = isSnippet ? state.outputs[stepName].full : state.outputs[stepName].snippet;
            e.target.textContent = isSnippet ? 'Show Snippet' : 'Show Full';
            outputPanel.dataset.view = isSnippet ? 'full' : 'snippet';
        }
    });

    // Query Step-by-Step Listeners
    queryAll('.query-step .run-step-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const stepElem = e.target.closest('.step');
            const stepIndex = parseInt(stepElem.dataset.stepIndex);
            
            state.query = elements.queryInput.value.trim();
            if (!state.query) return alert('Please enter a query.');
            
            let data, snippetData;
            try {
                switch(stepIndex) {
                    case 1: // Embed Query
                        data = await apiCall('/query/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: state.query }) });
                        state.queryEmbedding = data.api_response.embeddings[0];
                        snippetData = createSnippet('queryEmbedding', data);
                        showOutput('queryEmbedding', snippetData.full, snippetData.snippet);
                        break;
                    case 2: // Retrieve
                        data = await apiCall('/query/retrieve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query_embedding: state.queryEmbedding, use_hybrid_search: false }) });
                        state.retrievedDocs = data.results;
                        snippetData = createSnippet('retrieval', data);
                        showOutput('retrieval', snippetData.full, snippetData.snippet);
                        break;
                    case 3: // Rerank
                        if (!state.useReranking) return;
                        data = await apiCall('/query/rerank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: state.query, documents: state.retrievedDocs }) });
                        state.rerankedDocs = data.api_response.results.map(r => ({ ...state.retrievedDocs[r.index], rerank_score: r.relevance_score }));
                        snippetData = createSnippet('reranking', data);
                        showOutput('reranking', snippetData.full, snippetData.snippet);
                        break;
                    case 4: // Prompt Construction
                        const docsForPrompt = state.useReranking && state.rerankedDocs.length > 0 ? state.rerankedDocs : state.retrievedDocs;
                        data = await apiCall('/query/build-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: state.query, documents: docsForPrompt }) });
                        state.finalPrompt = data.prompt;
                        snippetData = createSnippet('promptConstruction', data);
                        showOutput('promptConstruction', snippetData.full, snippetData.snippet);
                        break;
                    case 5: // Final Answer
                        data = await apiCall('/query/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: state.finalPrompt }) });
                        queryElem('.step[data-step-name="finalAnswer"] .final-answer-panel').textContent = data.final_answer;
                        break;
                }

                if (stepIndex < 5) unlockNextStep(stepIndex);
            } catch (error) {
                console.error(`Error in step ${stepIndex}:`, error);
                // Optionally add user-facing error message in the UI
            }
        });
    });

    // --- Initial State ---
    resetQueryUI();
    updateStepTitles();
});