// Questionnaire Assistant Frontend

const API_BASE = '/api';

// Store the current template file and results for export (make them global)
window.currentTemplateFile = null;
window.currentFilledResults = null;

// Tab Navigation
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show corresponding content
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Refresh data for knowledge tab
        if (tabName === 'knowledge') {
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
            statusDiv.innerHTML = `<div class="status success">${data.message}</div>`;
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
            console.log('Stored template file:', file.name);
            console.log('Stored results with', data.results.length, 'answers');

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
                    ${result.needs_review ? '<span class="needs-review">⚠ Needs Review</span>' : ''}
                    <span title="${escapeHtml(result.reasoning)}">ℹ ${escapeHtml(result.reasoning.substring(0, 50))}...</span>
                    <button class="btn small" onclick="copyAnswer('${escapeHtml(result.suggested_answer).replace(/'/g, "\\'")}', event)">📋 Copy</button>
                </div>
            </div>
        `;
    }).join('');
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
                        ${data.needs_review ? '<span class="needs-review">⚠ Needs Review</span>' : ''}
                    </div>
                    <div style="margin-top: 12px; font-size: 0.9rem; color: #666;">
                        <strong>Reasoning:</strong> ${escapeHtml(data.reasoning)}
                    </div>
                    ${data.source_questions.length > 0 ? `
                        <div style="margin-top: 12px;">
                            <strong>Based on similar questions:</strong>
                            <ul style="margin-top: 8px; padding-left: 20px;">
                                ${data.source_questions.slice(0, 3).map(sq => `
                                    <li style="margin-bottom: 4px;">
                                        "${escapeHtml(sq.question.substring(0, 80))}..." (${sq.similarity}% match)
                                    </li>
                                `).join('')}
                            </ul>
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

        if (sourcesData.sources.length === 0) {
            sourcesList.innerHTML = '<div class="empty-state">No source files yet. Upload a completed questionnaire to get started.</div>';
        } else {
            sourcesList.innerHTML = sourcesData.sources.map(source => `
                <div class="source-item">
                    <span class="source-name">📄 ${escapeHtml(source)}</span>
                    <button class="btn danger small" onclick="deleteSource('${escapeHtml(source)}')">Delete</button>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading sources:', error);
    }

    // Load Q&A pairs
    try {
        const knowledgeResponse = await fetch(`${API_BASE}/knowledge`);
        const knowledge = await knowledgeResponse.json();
        const qaList = document.getElementById('qa-list');

        if (knowledge.pairs.length === 0) {
            qaList.innerHTML = '<div class="empty-state">No Q&A pairs in knowledge base.</div>';
        } else {
            // Show first 50 pairs
            const displayPairs = knowledge.pairs.slice(0, 50);
            qaList.innerHTML = displayPairs.map(qa => `
                <div class="qa-item">
                    <div class="question">Q: ${escapeHtml(qa.question)}</div>
                    <div class="answer">A: ${escapeHtml(qa.answer)}</div>
                    <div class="source">Source: ${escapeHtml(qa.source_file)}</div>
                </div>
            `).join('');

            if (knowledge.pairs.length > 50) {
                qaList.innerHTML += `<div class="empty-state">Showing 50 of ${knowledge.pairs.length} pairs</div>`;
            }
        }
    } catch (error) {
        console.error('Error loading knowledge:', error);
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
    console.log('Download button clicked');
    console.log('Template file:', window.currentTemplateFile);
    console.log('Results:', window.currentFilledResults);

    if (!window.currentTemplateFile || !window.currentFilledResults) {
        alert('No questionnaire to download. Please fill a questionnaire first.');
        return;
    }

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.disabled = true;
    downloadBtn.textContent = '⏳ Generating...';

    try {
        console.log('Creating FormData...');
        const formData = new FormData();
        formData.append('file', window.currentTemplateFile);
        formData.append('answers', JSON.stringify(window.currentFilledResults.results));

        console.log('Sending export request...');
        const response = await fetch(`${API_BASE}/export`, {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);

        if (response.ok) {
            // Get the blob
            const blob = await response.blob();

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `filled_${window.currentTemplateFile.name}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            downloadBtn.textContent = '✅ Downloaded!';
            setTimeout(() => {
                downloadBtn.textContent = '📥 Download Filled Questionnaire';
                downloadBtn.disabled = false;
            }, 2000);
        } else {
            const error = await response.json();
            alert(`Download failed: ${error.detail}`);
            downloadBtn.textContent = '📥 Download Filled Questionnaire';
            downloadBtn.disabled = false;
        }
    } catch (error) {
        alert(`Download error: ${error.message}`);
        downloadBtn.textContent = '📥 Download Filled Questionnaire';
        downloadBtn.disabled = false;
    }
}

// Copy answer to clipboard
function copyAnswer(answer, event) {
    // Unescape HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = answer;
    const cleanAnswer = textarea.value;

    navigator.clipboard.writeText(cleanAnswer).then(() => {
        // Show temporary confirmation
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.disabled = true;

        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 1500);
    }).catch(err => {
        alert('Failed to copy: ' + err);
    });
}

// Make copyAnswer available globally
window.copyAnswer = copyAnswer;

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
        console.log('Download button found, attaching event listener');
        downloadBtn.addEventListener('click', downloadFilledQuestionnaire);
    } else {
        console.error('Download button not found in DOM!');
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
