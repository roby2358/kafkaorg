// Kafkaorg - Conversation Page JavaScript

let currentUserId = null;
let currentUserName = null;
let conversationId = null;
let conversationTopic = null;
let ws = null;

function getCookie(name) {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.trim().split('=');
        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }
    return null;
}

function appendMessage(sender, message) {
    const dialogue = document.getElementById('dialogue');
    const line = `\n ${sender}> ${message}\n`;
    dialogue.value += line;
    dialogue.scrollTop = dialogue.scrollHeight;
}

async function startConversation() {
    const greetingEl = document.getElementById('greeting');
    currentUserId = getCookie('user_id');
    
    if (!currentUserId) {
        window.location.href = '/';
        return;
    }
    
    // Get user info
    try {
        const userResponse = await fetch('/api/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId })
        });
        
        const userData = await userResponse.json();
        
        if (!userData.found) {
            window.location.href = '/';
            return;
        }
        
        currentUserName = userData.user.name;
    } catch (error) {
        greetingEl.textContent = 'Error loading user';
        return;
    }
    
    // Create new conversation
    greetingEl.textContent = 'Creating conversation...';
    
    try {
        const convResponse = await fetch('/api/conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId })
        });
        
        const convData = await convResponse.json();
        
        if (convData.error) {
            greetingEl.textContent = `Error: ${convData.error}`;
            return;
        }
        
        conversationId = convData.conversation.id;
        conversationTopic = convData.conversation.topic;
        
        greetingEl.textContent = `Conversation #${conversationId}`;
        
        // Connect WebSocket
        connectWebSocket();
        
        // Enable chat
        initChat();
        
    } catch (error) {
        greetingEl.textContent = 'Error creating conversation';
        console.error(error);
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        // Subscribe to conversation (topic will be looked up from agent)
        ws.send(JSON.stringify({
            type: 'subscribe',
            conversation_id: conversationId
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'subscribed') {
            console.log('Subscribed to conversation');
        } else if (data.type === 'message') {
            // Agent message received
            appendMessage('agent', data.data.message);
        } else if (data.type === 'error') {
            console.error('WebSocket error:', data.message);
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function initChat() {
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;
        
        appendMessage(currentUserName, message);
        userInput.value = '';
        
        try {
            await fetch('/api/user-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    user_id: currentUserId,
                    message: message
                })
            });
            // Response will come via WebSocket
        } catch (error) {
            appendMessage('agent', 'Error: Could not send message');
        }
    }
    
    sendBtn.addEventListener('click', sendMessage);
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    userInput.focus();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});

startConversation();
