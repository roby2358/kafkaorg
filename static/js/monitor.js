// Kafkaorg - Monitor Page JavaScript

async function loadAgents() {
  try {
    const response = await fetch('/api/agents');
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load agents');
    }
    
    displayAgents(data.agents);
  } catch (error) {
    console.error('Error loading agents:', error);
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
      errorDiv.textContent = `Error: ${error instanceof Error ? error.message : 'Failed to load agents'}`;
      errorDiv.style.display = 'block';
    }
  }
}

function displayAgents(agents) {
  const container = document.getElementById('agents-container');
  if (!container) {
    return;
  }
  
  if (agents.length === 0) {
    container.innerHTML = '<p>No agents found.</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'agents-table';
  
  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['ID', 'Name', 'Topic', 'Model', 'Active (DB)', 'Running (Listener)', 'Start Time', 'Created'].forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Create body
  const tbody = document.createElement('tbody');
  agents.forEach(agent => {
    const row = document.createElement('tr');
    
    const idCell = document.createElement('td');
    idCell.textContent = agent.id;
    row.appendChild(idCell);
    
    const nameCell = document.createElement('td');
    nameCell.textContent = agent.name;
    row.appendChild(nameCell);
    
    const topicCell = document.createElement('td');
    topicCell.textContent = agent.topic;
    row.appendChild(topicCell);
    
    const modelCell = document.createElement('td');
    modelCell.textContent = agent.model;
    row.appendChild(modelCell);
    
    const activeCell = document.createElement('td');
    activeCell.textContent = agent.active ? 'Yes' : 'No';
    activeCell.className = agent.active ? 'status-active' : 'status-inactive';
    row.appendChild(activeCell);
    
    const runningCell = document.createElement('td');
    runningCell.textContent = agent.running ? 'Yes' : 'No';
    runningCell.className = agent.running ? 'status-running' : 'status-stopped';
    row.appendChild(runningCell);
    
    const startTimeCell = document.createElement('td');
    if (agent.startTime) {
      const startTimeDate = new Date(agent.startTime);
      startTimeCell.textContent = startTimeDate.toLocaleString();
    } else {
      startTimeCell.textContent = '-';
      startTimeCell.className = 'status-inactive';
    }
    row.appendChild(startTimeCell);
    
    const createdCell = document.createElement('td');
    const createdDate = new Date(agent.created);
    createdCell.textContent = createdDate.toLocaleString();
    row.appendChild(createdCell);
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

// Load agents on page load
document.addEventListener('DOMContentLoaded', () => {
  loadAgents();
  
  // Refresh every 5 seconds
  setInterval(loadAgents, 5000);
});
