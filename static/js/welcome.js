// Kafkaorg - Welcome Page JavaScript

// Clear the kafkaorg cookie when the welcome page loads
document.cookie = 'kafkaorg=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('user-id').value.trim();
    const errorDiv = document.getElementById('error');
    
    errorDiv.style.display = 'none';
    
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
            document.cookie = `kafkaorg=${userId}; path=/`;
            window.location.href = '/';
        } else {
            errorDiv.textContent = 'User ID not found.';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'An error occurred. Please try again.';
        errorDiv.style.display = 'block';
    }
});
