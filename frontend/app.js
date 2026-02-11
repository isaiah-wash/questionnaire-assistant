// Questionnaire Assistant Frontend

const API_BASE = '/api';

// Store the current template file and results for export (make them global)
window.currentTemplateFile = null;
window.currentFilledResults = null;

// Screen Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Show corresponding screen
        const screenName = link.dataset.screen;
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName).classList.add('active');

        // Refresh data for knowledge screen
        if (screenName === 'knowledge') {
            loadKnowledgeBase();
        }
    });
});

// File Upload Handling
function setupFileUpload(uploadAreaId, fileInputId, statusId, uploadHandler) {
    const uploadArea = document.getElementById(uploadAreaId);
    const fileInput = document.getElementById(fileInputId);
    const statusDiv = document.getElementById(statusId);

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            uploadHandler(file, statusDiv);
        }
    });

    // Click to upload
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadHandler(file, statusDiv);
        }
    });
}

// Upload to Knowledge Base
async function uploadToKnowledge(file, statusDiv) {
    statusDiv.innerHTML = '<div class="status loading"><span class="spinner"></span>Uploading and processing...</div>';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/upload-knowledge`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            statusDiv.innerHTML = `
                <div class="upload-success">
                    <div class="upload-success-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                    </div>
                    <div class="upload-success-title">Document Successfully Scraped</div>
                    <div class="upload-success-file">${escapeHtml(data.source_file)}</div>
                    <div class="upload-success-count">${data.count} Q&A pair${data.count !== 1 ? 's' : ''} extracted and added to the knowledge base</div>
                </div>
            `;
            loadKnowledgeBase();
        } else {
            statusDiv.innerHTML = `<div class="status error">Error: ${data.detail}</div>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<div class="status error">Error: ${error.message}</div>`;
    }
}

// Fill Questionnaire
async function fillQuestionnaire(file, statusDiv) {
    statusDiv.innerHTML = '<div class="status loading"><span class="spinner"></span>Processing questionnaire... This may take a moment.</div>';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/fill-questionnaire`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            statusDiv.innerHTML = `<div class="status success">Processed ${data.total_questions} questions</div>`;

            // Store template file and results for export
            window.currentTemplateFile = file;
            window.currentFilledResults = data;

            displayFillResults(data);
        } else {
            statusDiv.innerHTML = `<div class="status error">Error: ${data.detail}</div>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<div class="status error">Error: ${error.message}</div>`;
    }
}

// Display fill results
function displayFillResults(data) {
    const resultsDiv = document.getElementById('fill-results');
    const summaryDiv = document.getElementById('fill-summary');
    const answersDiv = document.getElementById('fill-answers');

    resultsDiv.style.display = 'block';

    // Summary
    summaryDiv.innerHTML = `
        <div class="summary-item">
            <span class="summary-dot high"></span>
            <span>High Confidence: ${data.summary.high_confidence}</span>
        </div>
        <div class="summary-item">
            <span class="summary-dot medium"></span>
            <span>Medium Confidence: ${data.summary.medium_confidence}</span>
        </div>
        <div class="summary-item">
            <span class="summary-dot low"></span>
            <span>Low Confidence: ${data.summary.low_confidence}</span>
        </div>
        <div class="summary-item">
            <span>Needs Review: ${data.summary.needs_review}</span>
        </div>
    `;

    // Answers
    answersDiv.innerHTML = data.results.map((result, index) => {
        const confidenceClass = result.confidence >= 80 ? 'high' : result.confidence >= 50 ? 'medium' : 'low';
        const confidenceLabel = result.confidence >= 80 ? 'High' : result.confidence >= 50 ? 'Medium' : 'Low';

        return `
            <div class="answer-card ${confidenceClass}-confidence">
                <div class="answer-question">${index + 1}. ${escapeHtml(result.question)}</div>
                <div class="answer-text" id="answer-${index}">${escapeHtml(result.suggested_answer) || '<em>No answer generated</em>'}</div>
                <div class="answer-meta">
                    <span class="confidence-badge ${confidenceClass}">${confidenceLabel} (${result.confidence}%)</span>
                    ${result.needs_review ? '<span class="needs-review">Needs Review</span>' : ''}
                    <span title="${escapeHtml(result.reasoning)}">${escapeHtml(result.reasoning.substring(0, 50))}...</span>
                    <button class="btn small primary" onclick="copyAnswer('${escapeHtml(result.suggested_answer).replace(/'/g, "\\'")}', event)">Copy</button>
                </div>
            </div>
        `;
    }).join('');

    // Scroll to results
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Ask single question
async function askQuestion() {
    const questionText = document.getElementById('question-text').value.trim();
    if (!questionText) return;

    const resultDiv = document.getElementById('ask-result');
    const answerDiv = document.getElementById('ask-answer');

    resultDiv.style.display = 'block';
    answerDiv.innerHTML = '<div class="status loading"><span class="spinner"></span>Generating answer...</div>';

    try {
        const response = await fetch(`${API_BASE}/answer-question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: questionText })
        });

        const data = await response.json();

        if (response.ok) {
            const confidenceClass = data.confidence >= 80 ? 'high' : data.confidence >= 50 ? 'medium' : 'low';
            const confidenceLabel = data.confidence >= 80 ? 'High' : data.confidence >= 50 ? 'Medium' : 'Low';

            answerDiv.innerHTML = `
                <div class="answer-card ${confidenceClass}-confidence">
                    <div class="answer-text">${escapeHtml(data.suggested_answer) || '<em>No answer found</em>'}</div>
                    <div class="answer-meta">
                        <span class="confidence-badge ${confidenceClass}">${confidenceLabel} (${data.confidence}%)</span>
                        ${data.needs_review ? '<span class="needs-review">Needs Review</span>' : ''}
                    </div>
                    <div style="margin-top: 12px; font-size: 0.9rem; color: var(--color-text-secondary);">
                        <strong>Reasoning:</strong> ${escapeHtml(data.reasoning)}
                    </div>
                    ${data.source_questions.length > 0 ? `
                        <div style="margin-top: 12px;">
                            <strong>Based on similar questions:</strong>
                            <div style="margin-top: 8px;">
                                ${data.source_questions.slice(0, 3).map(sq => `
                                    <div style="margin-bottom: 6px; font-size: 0.88rem; color: var(--color-text-secondary);">
                                        "${escapeHtml(sq.question.substring(0, 80))}..." (${sq.similarity}% match)
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            answerDiv.innerHTML = `<div class="status error">Error: ${data.detail}</div>`;
        }
    } catch (error) {
        answerDiv.innerHTML = `<div class="status error">Error: ${error.message}</div>`;
    }

    // Scroll to result
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Load Knowledge Base
async function loadKnowledgeBase() {
    // Load stats
    try {
        const statsResponse = await fetch(`${API_BASE}/stats`);
        const stats = await statsResponse.json();

        document.getElementById('stat-total').textContent = stats.total_qa_pairs;
        document.getElementById('stat-sources').textContent = stats.source_files;
    } catch (error) {
        console.error('Error loading stats:', error);
    }

    // Load sources
    try {
        const sourcesResponse = await fetch(`${API_BASE}/sources`);
        const sourcesData = await sourcesResponse.json();
        const sourcesList = document.getElementById('sources-list');
        const filterSelect = document.getElementById('qa-filter-source');

        // Populate source filter dropdown
        filterSelect.innerHTML = '<option value="">All Sources</option>' +
            sourcesData.sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

        if (sourcesData.sources.length === 0) {
            sourcesList.innerHTML = '<div class="empty-state">No source files yet. Upload a completed questionnaire to get started.</div>';
        } else {
            sourcesList.innerHTML = sourcesData.sources.map(source => {
                const ext = source.split('.').pop().toLowerCase();
                const iconClass = ['xlsx', 'xls', 'csv', 'docx', 'pdf'].includes(ext) ? ext : 'file';
                const labels = { xlsx: 'XLS', xls: 'XLS', csv: 'CSV', docx: 'DOC', pdf: 'PDF' };
                const label = labels[ext] || 'FILE';
                return `
                    <div class="source-card">
                        <div class="source-card-icon ${iconClass}">${label}</div>
                        <div class="source-card-name">${escapeHtml(source)}</div>
                        <button class="source-card-delete" onclick="deleteSource('${escapeHtml(source)}')">Delete</button>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading sources:', error);
    }

    // Load ALL Q&A pairs (no limit)
    try {
        const knowledgeResponse = await fetch(`${API_BASE}/knowledge`);
        const knowledge = await knowledgeResponse.json();
        const qaList = document.getElementById('qa-list');
        const qaCountDisplay = document.getElementById('qa-count-display');

        if (knowledge.pairs.length === 0) {
            qaList.innerHTML = '<div class="empty-state">No Q&A pairs in knowledge base.</div>';
            qaCountDisplay.textContent = '';
        } else {
            qaCountDisplay.textContent = `Showing ${knowledge.pairs.length} pairs`;

            // Render ALL pairs
            qaList.innerHTML = knowledge.pairs.map((qa, index) => `
                <div class="qa-item" data-source="${escapeHtml(qa.source_file)}">
                    <div class="question">Q: ${escapeHtml(qa.question)}</div>
                    <div class="answer">A: ${escapeHtml(qa.answer)}</div>
                    <div class="source"><span class="source-badge">${escapeHtml(qa.source_file)}</span></div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading knowledge:', error);
    }
}

// Q&A Search and Filter
function filterQAPairs() {
    const searchTerm = document.getElementById('qa-search').value.toLowerCase();
    const sourceFilter = document.getElementById('qa-filter-source').value;
    const items = document.querySelectorAll('.qa-item');
    let visibleCount = 0;

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const source = item.dataset.source;
        const matchesSearch = !searchTerm || text.includes(searchTerm);
        const matchesSource = !sourceFilter || source === sourceFilter;
        const visible = matchesSearch && matchesSource;
        item.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
    });

    const qaCountDisplay = document.getElementById('qa-count-display');
    const total = items.length;
    if (searchTerm || sourceFilter) {
        qaCountDisplay.textContent = `Showing ${visibleCount} of ${total} pairs`;
    } else {
        qaCountDisplay.textContent = `Showing ${total} pairs`;
    }
}

// Delete source
async function deleteSource(sourceName) {
    if (!confirm(`Delete all Q&A pairs from "${sourceName}"?`)) return;

    try {
        const response = await fetch(`${API_BASE}/knowledge/source/${encodeURIComponent(sourceName)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadKnowledgeBase();
        }
    } catch (error) {
        console.error('Error deleting source:', error);
    }
}

// Download filled questionnaire
async function downloadFilledQuestionnaire() {
    if (!window.currentTemplateFile || !window.currentFilledResults) {
        alert('No questionnaire to download. Please fill a questionnaire first.');
        return;
    }

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '<span class="spinner"></span> Generating...';

    try {
        const formData = new FormData();
        formData.append('file', window.currentTemplateFile);
        formData.append('answers', JSON.stringify(window.currentFilledResults.results));

        const response = await fetch(`${API_BASE}/export`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `filled_${window.currentTemplateFile.name}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            downloadBtn.innerHTML = 'Downloaded!';
            setTimeout(() => {
                downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Filled Questionnaire`;
                downloadBtn.disabled = false;
            }, 2000);
        } else {
            const error = await response.json();
            alert(`Download failed: ${error.detail}`);
            downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Filled Questionnaire`;
            downloadBtn.disabled = false;
        }
    } catch (error) {
        alert(`Download error: ${error.message}`);
        downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Filled Questionnaire`;
        downloadBtn.disabled = false;
    }
}

// Copy answer to clipboard
function copyAnswer(answer, event) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = answer;
    const cleanAnswer = textarea.value;

    navigator.clipboard.writeText(cleanAnswer).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.disabled = true;

        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 1500);
    }).catch(err => {
        alert('Failed to copy: ' + err);
    });
}

// Make functions available globally
window.copyAnswer = copyAnswer;
window.deleteSource = deleteSource;

// Utility: Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup file uploads
    setupFileUpload('knowledge-upload', 'knowledge-file', 'knowledge-upload-status', uploadToKnowledge);
    setupFileUpload('fill-upload', 'fill-file', 'fill-upload-status', fillQuestionnaire);

    // Setup ask button
    document.getElementById('ask-btn').addEventListener('click', askQuestion);

    // Setup download button
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadFilledQuestionnaire);
    }

    // Setup Q&A search and filter
    const qaSearch = document.getElementById('qa-search');
    const qaFilterSource = document.getElementById('qa-filter-source');
    if (qaSearch) {
        qaSearch.addEventListener('input', filterQAPairs);
    }
    if (qaFilterSource) {
        qaFilterSource.addEventListener('change', filterQAPairs);
    }

    // Allow Enter key in question textarea (Shift+Enter for newline)
    document.getElementById('question-text').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            askQuestion();
        }
    });

    // Load initial data
    loadKnowledgeBase();
});
