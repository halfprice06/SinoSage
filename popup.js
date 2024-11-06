document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveApiKey');
    const statusMessage = document.getElementById('statusMessage');

    // Load and display any previously saved API key (optional)
    chrome.storage.local.get('apiKey', (data) => {
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
        }
    });

    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ apiKey: apiKey }, () => {
                statusMessage.textContent = 'API Key saved!';
                setTimeout(() => { statusMessage.textContent = ''; }, 2000);
            });
        } else {
            statusMessage.textContent = 'Please enter a valid API Key.';
            setTimeout(() => { statusMessage.textContent = ''; }, 2000);
        }
    });
}); 