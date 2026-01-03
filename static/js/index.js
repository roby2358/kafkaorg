// Kafkaorg - Index Page JavaScript

document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const greetingDiv = document.getElementById('greeting');
    const errorDiv = document.getElementById('error');
    
    greetingDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    
    try {
        const response = await fetch('/api/signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: username })
        });
        
        const data = await response.json();
        
        if (data.found) {
            greetingDiv.textContent = `Hello, ${data.user.name}!`;
            greetingDiv.style.display = 'block';
        } else {
            window.location.href = '/signup?username=' + encodeURIComponent(username);
        }
    } catch (error) {
        errorDiv.textContent = 'An error occurred. Please try again.';
        errorDiv.style.display = 'block';
    }
});
