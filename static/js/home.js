// Kafkaorg - Home Page JavaScript

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

async function loadGreeting() {
    const greetingEl = document.getElementById('greeting');
    const userId = getCookie('user_id');
    
    if (!userId) {
        window.location.href = '/';
        return;
    }
    
    try {
        const response = await fetch('/api/signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId })
        });
        
        const data = await response.json();
        
        if (data.found) {
            greetingEl.textContent = `Hello, ${data.user.name}!`;
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        greetingEl.textContent = 'An error occurred loading your profile.';
    }
}

loadGreeting();
