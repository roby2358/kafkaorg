// Kafkaorg - Docmem Page JavaScript

let currentMode = 'graph';
let selectedNodeId = null;
let currentLength = 3000;
let structureCache = null;

async function loadRoots() {
    const tbody = document.getElementById('roots-table-body');
    
    try {
        const response = await fetch('/api/docmem/roots');
        const data = await response.json();
        
        if (data.roots && data.roots.length > 0) {
            tbody.innerHTML = '';
            data.roots.forEach(root => {
                const row = document.createElement('tr');
                row.dataset.nodeId = root.id;
                row.innerHTML = `
                    <td>${escapeHtml(root.id)}</td>
                    <td>${escapeHtml(root.description)}</td>
                `;
                row.addEventListener('click', () => selectRoot(root.id));
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="2">No docmems found.</td></tr>';
        }
    } catch (error) {
        console.error('Error loading roots:', error);
        tbody.innerHTML = '<tr><td colspan="2">Error loading docmems.</td></tr>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function selectRoot(nodeId) {
    selectedNodeId = nodeId;
    
    document.querySelectorAll('.docmem-table tbody tr').forEach(row => {
        row.classList.remove('selected');
        if (row.dataset.nodeId === nodeId) {
            row.classList.add('selected');
        }
    });
    
    structureCache = null;
    loadViewer();
}

async function loadViewer() {
    if (!selectedNodeId) {
        document.getElementById('viewer-panel').innerHTML = '<p>Select a docmem from the table to view.</p>';
        return;
    }
    
    document.getElementById('viewer-panel').innerHTML = '<p>Loading...</p>';
    
    try {
        if (currentMode === 'graph') {
            await loadGraphView();
        } else if (currentMode === 'expanded') {
            await loadExpandedView();
        } else if (currentMode === 'serialized') {
            await loadSerializedView();
        }
    } catch (error) {
        console.error('Error loading viewer:', error);
        document.getElementById('viewer-panel').innerHTML = '<p>Error loading content.</p>';
    }
}

async function loadGraphView() {
    const panel = document.getElementById('viewer-panel');
    panel.className = 'viewer-panel graph-view';
    
    if (!structureCache) {
        const response = await fetch(`/api/docmem/${selectedNodeId}/serialize`);
        const data = await response.json();
        structureCache = data.nodes || [];
    }
    
    if (!structureCache || structureCache.length === 0) {
        panel.innerHTML = '<p>No structure data available.</p>';
        return;
    }
    
    const nodeMap = new Map();
    structureCache.forEach(node => {
        nodeMap.set(node.id, node);
    });
    
    const rootNode = structureCache.find(n => n.id === selectedNodeId);
    if (!rootNode) {
        panel.innerHTML = '<p>Root node not found.</p>';
        return;
    }
    
    const childrenMap = new Map();
    structureCache.forEach(node => {
        if (node.parentId) {
            if (!childrenMap.has(node.parentId)) {
                childrenMap.set(node.parentId, []);
            }
            childrenMap.get(node.parentId).push(node);
        }
    });
    
    function buildHierarchy(nodeId, depth = 0) {
        const node = nodeMap.get(nodeId);
        if (!node) return '';
        
        const children = childrenMap.get(nodeId) || [];
        const sortedChildren = children.sort((a, b) => a.order - b.order);
        
        const metadata = `[${node.contextType}:${node.contextName}:${node.contextValue}] tokens:${node.tokenCount}`;
        
        let html = `
            <div class="node-item" data-node-id="${escapeHtml(node.id)}" style="padding-left: ${depth * 1.5}rem;">
                <div class="node-header" onclick="toggleNode('${escapeHtml(node.id)}')">
                    <span class="node-id">${escapeHtml(node.id)}</span>
                    <span class="node-meta">${escapeHtml(metadata)}</span>
                </div>
                <div class="node-content">${escapeHtml(node.text)}</div>
            </div>
        `;
        
        sortedChildren.forEach(child => {
            html += buildHierarchy(child.id, depth + 1);
        });
        
        return html;
    }
    
    panel.innerHTML = buildHierarchy(selectedNodeId);
}

window.toggleNode = function(nodeId) {
    const nodeItem = document.querySelector(`.node-item[data-node-id="${escapeHtml(nodeId)}"]`);
    if (nodeItem) {
        nodeItem.classList.toggle('expanded');
    }
};

async function loadExpandedView() {
    const panel = document.getElementById('viewer-panel');
    panel.className = 'viewer-panel';
    
    const response = await fetch(`/api/docmem/${selectedNodeId}/expand?length=${currentLength}`);
    const data = await response.json();
    
    if (!data.nodes || data.nodes.length === 0) {
        panel.innerHTML = '<p>No expanded data available.</p>';
        return;
    }
    
    let html = '';
    data.nodes.forEach((node, index) => {
        if (index > 0) {
            html += '<div class="separator">---</div>';
        }
        
        const metadata = `id: ${node.id} | ${node.contextType}:${node.contextName}:${node.contextValue} | tokens: ${node.tokenCount}`;
        html += `<div class="metadata">${escapeHtml(metadata)}</div>`;
        html += `<div class="content">${escapeHtml(node.text)}</div>`;
    });
    
    panel.innerHTML = html;
}

async function loadSerializedView() {
    const panel = document.getElementById('viewer-panel');
    panel.className = 'viewer-panel';
    
    const response = await fetch(`/api/docmem/${selectedNodeId}/serialize`);
    const data = await response.json();
    
    if (!data.content) {
        panel.innerHTML = '<p>No serialized data available.</p>';
        return;
    }
    
    panel.textContent = data.content;
}

document.querySelectorAll('.mode-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        
        document.querySelectorAll('.mode-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        currentMode = link.dataset.mode;
        
        const lengthControl = document.getElementById('expanded-length-control');
        if (currentMode === 'expanded') {
            lengthControl.style.display = 'flex';
        } else {
            lengthControl.style.display = 'none';
        }
        
        structureCache = null;
        loadViewer();
    });
});

document.getElementById('apply-length-btn').addEventListener('click', () => {
    const lengthInput = document.getElementById('length-input');
    const newLength = parseInt(lengthInput.value, 10);
    if (!isNaN(newLength) && newLength > 0) {
        currentLength = newLength;
        loadViewer();
    }
});

loadRoots();
