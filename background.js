chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');

  // Initialize the plugin state on installation
  chrome.storage.local.set({ enabled: true });
});

// Listen for the browser action button click
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get('enabled', (data) => {
    const newState = !data.enabled;
    chrome.storage.local.set({ enabled: newState });

    // Optionally, update the icon to reflect the state
    chrome.action.setIcon({
      path: newState ? 'icon_enabled.png' : 'icon_disabled.png',
      tabId: tab.id,
    });

    // Send a message to the content script to update the state
    chrome.tabs.sendMessage(tab.id, { action: 'updatePluginState', enabled: newState });
  });
});

// Helper function to handle API calls
async function makeAPICall(apiKey, endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  return await response.json();
}

// Function to retrieve the API key from storage
function getApiKey(callback) {
  chrome.storage.local.get('apiKey', (data) => {
    if (data.apiKey) {
      callback(data.apiKey);
    } else {
      console.error('API Key not set');
      callback(null);
    }
  });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'translate') {
    getApiKey((apiKey) => {
      if (!apiKey) {
        sendResponse({ success: false, error: 'API Key not set' });
        return;
      }

      // Update the function schema to enforce character-by-character alignment
      const functions = [
        {
          name: "extract_translation_data",
          description: "Extracts translation data from Chinese text, with pinyin aligned character by character.",
          parameters: {
            type: "object",
            properties: {
              full_translation: {
                type: "string",
                description: "Full English translation of the selected Chinese text"
              },
              tuples: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    chinese: {
                      type: "string",
                      description: "Single Chinese character or meaningful group of characters"
                    },
                    pinyin: {
                      type: "array",
                      description: "Array of pinyin syllables, one for each character in the Chinese string",
                      items: {
                        type: "string"
                      }
                    },
                    english: {
                      type: "string",
                      description: "English translation of this character or group"
                    }
                  },
                  required: ["chinese", "pinyin", "english"],
                  additionalProperties: false
                }
              }
            },
            required: ["full_translation", "tuples"],
            additionalProperties: false
          }
        }
      ];

      // Update the system message to explicitly request numbered pinyin
      const messages = [
        { 
          role: "system", 
          content: `You are a translation assistant that extracts structured data from Chinese text. Follow these strict rules:
                    1. Break down the text into meaningful units (words or phrases)
                    2. For each unit, provide the pinyin with tone numbers (1-4) at the end of each syllable (e.g., 'ni3' for 你, 'hao3' for 好)
                    3. For each unit, provide the pinyin as an array where each element corresponds to exactly one character
                    4. Example: for '你好', pinyin should be ['ni3', 'hao3']
                    5. Include all characters (including particles like 的, 和, 等, 和, 。, ！, ？, ，) either grouped logically or as separate units, BUT ALWAYS INCLUDE EVERY CHARACTER.
                    6. Ensure the number of pinyin syllables exactly matches the number of Chinese characters in each group
                    7. Always include the tone number (1-4) at the end of each pinyin syllable, using 5 for neutral tone`
        },
        { role: "user", content: request.text }
      ];

      // Make the API call using function calling
      makeAPICall(apiKey, 'https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o', // Use a model that supports function calling
        messages: messages,
        functions: functions,
        function_call: { "name": "extract_translation_data" },
        // Optionally, set 'temperature' to control randomness
        temperature: 0
      })
      .then(data => {
        console.log('API Response:', data); // Add this line for better error logging

        if (data.error) {
          console.error('API Error:', data.error);
          sendResponse({ success: false, error: data.error.message });
        } else if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          const message = choice.message;

          if (message.function_call && message.function_call.arguments) {
            // Parse the arguments returned by the function call
            try {
              const parsedData = JSON.parse(message.function_call.arguments);
              // Successfully parsed structured data
              sendResponse({ success: true, data: parsedData });
            } catch (e) {
              console.error('JSON Parse Error:', e);
              sendResponse({ success: false, error: 'Failed to parse function arguments.' });
            }
          } else {
            // Handle cases where function_call is not present
            console.error('No function call in response:', message);
            sendResponse({ success: false, error: 'No function call in response.' });
          }
        } else {
          sendResponse({ success: false, error: 'No response from API' });
        }
      })
      .catch(error => {
        console.error('Error:', error);
        sendResponse({ success: false, error: error.message });
      });

      return true; // Keep the message channel open
    });
  } else if (request.action === 'pronounce') {
    getApiKey((apiKey) => {
      if (!apiKey) {
        sendResponse({ success: false, error: 'API Key not set' });
        return;
      }

      makeAPICall(apiKey, 'https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-audio-preview',
        messages: [
          { "role": "system", "content": "You are reading assistant helping someone to learn Mandarin. Read out the following text in Mandarin and speak slowly. Do not skip any characters, you must always pronounce every single Mandarin character. Never explain anything about the translation, just pronounce the characters." },
          { "role": "user", "content": request.text }
        ],
        modalities: ["text", "audio"],
        audio: { 
          "voice": "alloy",
          "format": "wav"
        }
      })
      .then(data => {
        if (data.error) {
          console.error('API Error:', data.error);
          sendResponse({ success: false, error: data.error.message });
        } else if (
          data.choices && 
          data.choices.length > 0 && 
          data.choices[0].message.audio &&
          data.choices[0].message.audio.data
        ) {
          // Get the base64 audio data from the response
          const audioData = data.choices[0].message.audio.data;
          sendResponse({ success: true, data: audioData });
        } else {
          sendResponse({ success: false, error: 'No audio data from API' });
        }
      })
      .catch(error => {
        console.error('Error:', error);
        sendResponse({ success: false, error: error.message });
      });

      return true; // Keep the message channel open
    });
  } else if (request.action === 'getPluginState') {
    chrome.storage.local.get('enabled', (data) => {
      sendResponse({ enabled: data.enabled });
    });
    return true; // Keep the message channel open for sendResponse
  } else if (request.action === 'pronounce-partial') {
    getApiKey((apiKey) => {
      if (!apiKey) {
        sendResponse({ success: false, error: 'API Key not set' });
        return;
      }

      makeAPICall(apiKey, 'https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-audio-preview',
        messages: [
          {
            "role": "system",
            "content": "You are a reading assistant helping someone to learn Mandarin. Read out the following text in Mandarin and speak slowly. Do not skip any characters; you must always pronounce every single Mandarin character. Never explain anything about the translation; just pronounce the characters."
          },
          { "role": "user", "content": request.text }
        ],
        modalities: ["text", "audio"],
        audio: {
          "voice": "alloy",
          "format": "wav"
        }
      })
      .then(data => {
        if (data.error) {
          console.error('API Error:', data.error);
          sendResponse({ success: false, error: data.error.message });
        } else if (
          data.choices &&
          data.choices.length > 0 &&
          data.choices[0].message.audio &&
          data.choices[0].message.audio.data
        ) {
          // Get the base64 audio data from the response
          const audioData = data.choices[0].message.audio.data;
          sendResponse({ success: true, data: audioData });
        } else {
          sendResponse({ success: false, error: 'No audio data from API' });
        }
      })
      .catch(error => {
        console.error('Error:', error);
        sendResponse({ success: false, error: error.message });
      });

      return true; // Keep the message channel open
    });
  } else {
    sendResponse({ success: false, error: 'Unknown action' });
  }

  return true; // Keep the message channel open
});