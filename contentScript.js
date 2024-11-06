const MAX_POPUP_WIDTH = '1000px';  // Maximum width for long content
const MIN_POPUP_WIDTH = '300px';   // Minimum width for short content
const IDEAL_ITEMS_PER_ROW = 8;     // Preferred number of items in a row before pagination
const MIN_ITEMS_PER_PAGE = 3;      // Minimum items per page
const DEFAULT_ITEMS_PER_PAGE = MIN_ITEMS_PER_PAGE;  // Default to minimum items per page
const MAX_CHARS = 150;  // Maximum number of characters allowed for translation
const CHINESE_REGEX = /[\u4e00-\u9fff]/;  // Unicode range for Chinese characters
const HANZI_WRITER_URL = chrome.runtime.getURL('lib/hanzi-writer.min.js');

let currentPage = 0;
let allTuples = [];
let itemsPerPage = DEFAULT_ITEMS_PER_PAGE;

let currentPages = []; // Store all pages
let currentPageIndex = 0;

const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.type = 'text/css';
cssLink.href = chrome.runtime.getURL('translation_popup.css');
document.head.appendChild(cssLink);

function convertPinyinToToneMarks(pinyin) {
    // Return early if pinyin is not a string or is empty
    if (!pinyin || typeof pinyin !== 'string') {
        return '';
    }

    // First, handle 'ü' special case
    pinyin = pinyin.replace(/v/g, 'ü');
    
    // Define vowel to tone mark mappings
    const toneMarks = {
        'a': ['ā', 'á', 'ǎ', 'à', 'a'],
        'e': ['ē', 'é', 'ě', 'è', 'e'],
        'i': ['ī', 'í', 'ǐ', 'ì', 'i'],
        'o': ['ō', 'ó', 'ǒ', 'ò', 'o'],
        'u': ['ū', 'ú', 'ǔ', 'ù', 'u'],
        'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü']
    };

    // Extract the tone number (if it exists)
    const toneNumber = pinyin.match(/[1-5]$/);
    if (!toneNumber) return pinyin;

    const tone = parseInt(toneNumber[0]) - 1;
    let word = pinyin.substring(0, pinyin.length - 1);

    // Handle special cases where the tone mark should go on a specific vowel
    const vowels = 'aeiouü';
    const vowelsInWord = word.split('').filter(char => vowels.includes(char));

    if (vowelsInWord.length === 1) {
        // Only one vowel, put the tone mark on it
        const vowel = vowelsInWord[0];
        return word.replace(vowel, toneMarks[vowel][tone]);
    } else if (word.includes('a')) {
        return word.replace('a', toneMarks['a'][tone]);
    } else if (word.includes('e')) {
        return word.replace('e', toneMarks['e'][tone]);
    } else if (word.includes('ou')) {
        return word.replace('o', toneMarks['o'][tone]);
    } else {
        // Put tone mark on last vowel if exists, otherwise return original
        const lastVowel = vowelsInWord[vowelsInWord.length - 1];
        return lastVowel ? word.replace(lastVowel, toneMarks[lastVowel][tone]) : word;
    }
}

function positionPopup(popup, rect) {
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate popup dimensions after content is loaded
    const popupWidth = Math.min(
        popup.offsetWidth,
        parseInt(MAX_POPUP_WIDTH)
    );
    
    // Center horizontally relative to the selection
    const selectionCenter = rect.left + (rect.width / 2);
    let leftPosition = selectionCenter - (popupWidth / 2);
    
    // Ensure popup stays within viewport horizontally
    leftPosition = Math.max(10, leftPosition); // At least 10px from left edge
    leftPosition = Math.min(leftPosition, viewportWidth - popupWidth - 10); // At least 10px from right edge
    
    // Position vertically below the selection
    // Add the current scroll position since we're using fixed positioning
    let topPosition = rect.bottom + 5;

    // Set fixed positioning
    popup.style.position = 'fixed';
    popup.style.left = `${leftPosition}px`;
    popup.style.top = `${topPosition}px`;
}

function createPopup(selectedText, rect) {
    // Remove existing popup if any
    let existingPopup = document.getElementById('translationPopup');
    if (existingPopup) {
        existingPopup.remove();
    }

    // Create a popup element
    let popup = document.createElement('div');
    popup.id = 'translationPopup';
    popup.className = 'translation-popup';
    
    // Set fixed positioning immediately
    popup.style.position = 'fixed';

    popup.innerHTML = `
        <div id="translationDetails">
            <div class="loading-container">
                <div class="chinese-coin"></div>
                <div class="loading-text">Translating...</div>
            </div>
        </div>
        <div id="translation-container"></div>
        <hr class="separator">
        <div class="pagination-controls">
            <button class="nav-button prev">←</button>
            <span class="page-info">Page 1</span>
            <button class="nav-button next">→</button>
        </div>
        <hr class="separator">
        <div id="fullTranslation" class="full-translation"></div>
        <div style="text-align: center; margin-top: 10px;">
            <button id="playAudioButton" disabled>Loading pronunciation...</button>
        </div>
    `;

    document.body.appendChild(popup);

    // Initial positioning
    positionPopup(popup, rect);

    // Reposition after content loads
    const observer = new MutationObserver(() => {
        positionPopup(popup, rect);
    });

    observer.observe(popup, {
        childList: true,
        subtree: true,
        attributes: true
    });

    // Get reference to the play button
    const playButton = document.getElementById('playAudioButton');
    let audioUrl = null;

    // Add a single event listener for the play button
    playButton.addEventListener('click', function (event) {
        // Prevent default behavior
        event.preventDefault();
        // Stop event from bubbling up
        event.stopPropagation();
        // Stop immediate propagation to ensure no other handlers run
        event.stopImmediatePropagation();
        
        if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play().catch((error) => {
                console.error('Audio playback error:', error);
                alert('Error playing audio: ' + error.message);
            });
        }
    });

    // Also add mouseup and mousedown prevention
    playButton.addEventListener('mouseup', function(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    });

    playButton.addEventListener('mousedown', function(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    });

    // Add pagination functionality
    function updatePagination(translationData) {
        allTuples = translationData.tuples;
        
        const container = document.getElementById('translation-container');
        if (!container) return;

        // Calculate available width
        const containerWidth = container.offsetWidth - 40; // subtract padding
        const testItem = createTranslationItem(allTuples[0]);
        container.appendChild(testItem);
        const itemWidth = testItem.offsetWidth + 15; // Add gap size
        
        // Calculate how many items can fit in a row
        const itemsPerRow = Math.max(
            MIN_ITEMS_PER_PAGE,
            Math.floor(containerWidth / itemWidth)
        );
        
        // Set items per page to be the calculated number
        itemsPerPage = Math.min(itemsPerRow * 2, allTuples.length); // Show 2 rows worth of items
        
        // Clean up test item
        container.innerHTML = '';
        
        // Show the first page
        showPage(0, itemsPerPage);
        
        // Update pagination controls
        const totalPages = Math.ceil(allTuples.length / itemsPerPage);
        const paginationControls = document.querySelector('.pagination-controls');
        
        if (paginationControls) {
            if (totalPages > 1) {
                paginationControls.style.display = 'flex';
            } else {
                paginationControls.style.display = 'none';
            }
        }
    }

    // Add this helper function to create translation items
    function createTranslationItem(tuple) {
        const div = document.createElement('div');
        div.className = 'translation-item';
        
        const chineseContainer = document.createElement('div');
        chineseContainer.className = 'chinese-container';
        
        const characters = Array.from(tuple.chinese);
        characters.forEach((char, index) => {
            const charWrapper = document.createElement('div');
            charWrapper.className = 'char-wrapper';
            
            const charSpan = document.createElement('span');
            charSpan.className = 'chinese-char';
            charSpan.textContent = char;
            
            // Add click handler for stroke order
            charSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                showStrokeOrderPopup(char, e.target.getBoundingClientRect());
            });
            
            const pinyinSpan = document.createElement('span');
            pinyinSpan.className = 'pinyin';
            const rawPinyin = tuple.pinyin[index];
            pinyinSpan.textContent = rawPinyin ? convertPinyinToToneMarks(rawPinyin) : '';
            
            charWrapper.appendChild(charSpan);
            charWrapper.appendChild(pinyinSpan);
            chineseContainer.appendChild(charWrapper);
        });
        
        div.appendChild(chineseContainer);
        
        const englishDiv = document.createElement('div');
        englishDiv.className = 'english';
        englishDiv.textContent = tuple.english;
        div.appendChild(englishDiv);

        // Add speaker button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'speaker-button-container';
        
        const speakerButton = document.createElement('button');
        speakerButton.className = 'speaker-button';
        speakerButton.innerHTML = '🔊'; // Unicode speaker icon
        speakerButton.title = 'Play pronunciation';
        
        buttonContainer.appendChild(speakerButton);
        div.appendChild(buttonContainer);

        // Add click event listener to the speaker button
        speakerButton.addEventListener('click', function(event) {
            event.stopPropagation();
            
            // Visual feedback - disable button and show loading state
            speakerButton.disabled = true;
            speakerButton.innerHTML = '⌛'; // Hour glass icon for loading state
            
            chrome.runtime.sendMessage(
                {
                    action: 'pronounce-partial',
                    text: tuple.chinese
                },
                function(response) {
                    if (response && response.success) {
                        const audioUrl = 'data:audio/wav;base64,' + response.data;
                        const audio = new Audio(audioUrl);
                        
                        audio.onended = () => {
                            speakerButton.disabled = false;
                            speakerButton.innerHTML = '🔊';
                        };
                        
                        audio.play().catch((error) => {
                            console.error('Audio playback error:', error);
                            speakerButton.disabled = false;
                            speakerButton.innerHTML = '❌';
                            setTimeout(() => {
                                speakerButton.innerHTML = '🔊';
                            }, 1000);
                        });
                    } else {
                        console.error('Error getting audio:', response ? response.error : 'Unknown error');
                        speakerButton.disabled = false;
                        speakerButton.innerHTML = '❌';
                        setTimeout(() => {
                            speakerButton.innerHTML = '🔊';
                        }, 1000);
                    }
                }
            );
        });

        return div;
    }

    function showPage(pageNumber, itemsPerPage) {
        const container = document.getElementById('translation-container');
        if (!container) return;

        const startIndex = pageNumber * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, allTuples.length);
        const pageItems = allTuples.slice(startIndex, endIndex);

        container.innerHTML = '';
        
        // Create a flex container that will wrap items into rows
        const pageContainer = document.createElement('div');
        pageContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            justify-content: center;
            width: 100%;
        `;
        
        container.appendChild(pageContainer);

        pageItems.forEach((tuple, index) => {
            const item = createTranslationItem(tuple);
            if (index !== pageItems.length - 1) {
                item.style.marginRight = '15px';
            }
            pageContainer.appendChild(item);
        });

        // Update pagination controls
        const totalPages = Math.ceil(allTuples.length / itemsPerPage);
        const prevButton = document.querySelector('.nav-button.prev');
        const nextButton = document.querySelector('.nav-button.next');
        const pageInfo = document.querySelector('.page-info');
        
        if (prevButton && nextButton && pageInfo) {
            prevButton.disabled = pageNumber === 0;
            nextButton.disabled = pageNumber >= totalPages - 1;
            pageInfo.textContent = `Page ${pageNumber + 1}`;
        }

        currentPage = pageNumber;
    }

    // Helper functions for event handling
    function preventBubbling(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    }

    function handlePaginationClick(e) {
        preventBubbling(e);
        
        const isNext = e.target.classList.contains('next');
        const totalPages = Math.ceil(allTuples.length / itemsPerPage);
        
        if (isNext && currentPage < totalPages - 1) {
            currentPage++;
            showPage(currentPage, itemsPerPage);
        } else if (!isNext && currentPage > 0) {
            currentPage--;
            showPage(currentPage, itemsPerPage);
        }
        
        // Update page info
        const pageInfo = document.querySelector('.page-info');
        if (pageInfo) {
            pageInfo.textContent = `Page ${currentPage + 1}`;
        }
        
        // Update button states
        const prevButton = document.querySelector('.nav-button.prev');
        const nextButton = document.querySelector('.nav-button.next');
        if (prevButton) prevButton.disabled = currentPage === 0;
        if (nextButton) nextButton.disabled = currentPage >= totalPages - 1;
    }

    // Modify the document click handler to properly check for pagination clicks
    function handleDocumentClick(event) {
        const popup = document.getElementById('translationPopup');
        const strokePopup = document.getElementById('strokeOrderPopup');
        
        if (!popup) return;

        // Don't close if clicking inside popups
        if (popup.contains(event.target) || 
            (strokePopup && strokePopup.contains(event.target))) {
            return;
        }

        // Clean up stroke order writer if it exists
        if (strokePopup) {
            window.postMessage({ type: 'cleanupWriter' }, '*');
            strokePopup.remove();
        }

        // Remove the main popup
        popup.remove();
        document.removeEventListener('mousedown', handleDocumentClick);
        // Reset pagination state
        currentPage = 0;
        allTuples = [];
        itemsPerPage = DEFAULT_ITEMS_PER_PAGE;
    }

    // Replace the old document click listener with the new one
    document.addEventListener('mousedown', handleDocumentClick);

    // Translation request
    chrome.runtime.sendMessage(
        {
            action: 'translate',
            text: selectedText,
        },
        function(response) {
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                popup.innerHTML = 'Error: ' + chrome.runtime.lastError.message;
                return;
            }

            // Add detailed logging of the response
            console.log('Full API Response:', response);
            if (response && response.success && response.data) {
                console.log('Translation Data:', response.data);
                console.log('Tuples:', response.data.tuples);
                // Log the first tuple's pinyin to check format
                if (response.data.tuples.length > 0) {
                    console.log('First tuple pinyin:', response.data.tuples[0].pinyin);
                }
            }

            if (response && response.success) {
                const translationData = response.data;
                // Hide the loading container
                const loadingContainer = document.querySelector('.loading-container');
                if (loadingContainer) loadingContainer.style.display = 'none';
                
                updatePagination(translationData);
                
                // Update the full translation with quotes
                const fullTranslationDiv = document.getElementById('fullTranslation');
                if (fullTranslationDiv) {
                    fullTranslationDiv.innerHTML = `"${translationData.full_translation}"`;
                    fullTranslationDiv.style.display = 'block';
                }
            } else {
                popup.innerHTML = 'Error: ' + (response ? response.error : 'Unknown error');
            }
        }
    );

    // Pronunciation request
    chrome.runtime.sendMessage(
        {
            action: 'pronounce',
            text: selectedText,
        },
        function(response) {
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                playButton.textContent = 'Error loading audio';
                return;
            }

            if (response && response.success) {
                audioUrl = 'data:audio/wav;base64,' + response.data;
                playButton.disabled = false;
                playButton.textContent = 'Play Pronunciation';
            } else {
                playButton.textContent = 'Error loading audio';
            }
        }
    );

    // Add event listeners for pagination buttons
    const prevButton = document.querySelector('.nav-button.prev');
    const nextButton = document.querySelector('.nav-button.next');
    
    if (prevButton) {
        prevButton.addEventListener('click', handlePaginationClick);
        prevButton.addEventListener('mouseup', preventBubbling);
        prevButton.addEventListener('mousedown', preventBubbling);
    }
    
    if (nextButton) {
        nextButton.addEventListener('click', handlePaginationClick);
        nextButton.addEventListener('mouseup', preventBubbling);
        nextButton.addEventListener('mousedown', preventBubbling);
    }
}

// Replace the existing mouseup event listener with this updated version
document.addEventListener('mouseup', function (event) {
    // Check if the selection is inside the translation popup
    const existingPopup = document.getElementById('translationPopup');
    if (existingPopup && existingPopup.contains(event.target)) {
        return; // Don't create a new popup if selecting inside existing popup
    }

    setTimeout(function () {
        let selectedText = window.getSelection().toString().trim();
        
        // Check if the first character is Chinese
        if (selectedText.length > 0 && !CHINESE_REGEX.test(selectedText[0])) {
            let alertPopup = document.createElement('div');
            alertPopup.className = 'translation-popup';
            alertPopup.style.padding = '15px';
            alertPopup.style.textAlign = 'center';
            alertPopup.innerHTML = `
                <div style="color: #ff4444;">
                    Please select text that begins with Chinese characters.
                </div>
            `;

            let rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
            document.body.appendChild(alertPopup);
            positionPopup(alertPopup, rect);

            setTimeout(() => {
                alertPopup.remove();
            }, 1500);
            
            return;
        }

        // Check if selected text exceeds character limit
        if (selectedText.length > MAX_CHARS) {
            let alertPopup = document.createElement('div');
            alertPopup.className = 'translation-popup';
            alertPopup.style.padding = '15px';
            alertPopup.style.textAlign = 'center';
            alertPopup.innerHTML = `
                <div style="color: #ff4444;">
                    Please select fewer characters (maximum ${MAX_CHARS}).
                    <br>
                    Current selection: ${selectedText.length} characters
                </div>
            `;

            let rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
            document.body.appendChild(alertPopup);
            positionPopup(alertPopup, rect);

            setTimeout(() => {
                alertPopup.remove();
            }, 1500);
            
            return;
        }

        if (selectedText.length > 0) {
            let selection = window.getSelection();
            let range = selection.getRangeAt(0);
            let rect = range.getBoundingClientRect();
            createPopup(selectedText, rect);
        }
    }, 10);
});

// In the function that handles creating pages
function createPages(selectedText) {
    const CHARS_PER_PAGE = 5; // Increase this to something like 30
    const pages = [];
    let currentPage = '';
    
    // Split by characters instead of words
    const characters = selectedText.split('');
    
    characters.forEach((char, index) => {
        currentPage += char;
        
        // When we hit the page limit or it's the last character
        if (currentPage.length === CHARS_PER_PAGE || index === characters.length - 1) {
            pages.push(currentPage);
            currentPage = '';
        }
    });
    
    return pages;
}

function showPage(pageIndex) {
    const container = document.querySelector('.translation-container');
    // Clear existing content
    container.innerHTML = '';
    
    // Show current page content
    const pageContent = currentPages[pageIndex];
    
    // Create and append page content
    const pageElement = createPageElement(pageContent, pageIndex + 1, currentPages.length);
    container.appendChild(pageElement);
    
    // Update navigation state
    updateNavigation(pageIndex, currentPages.length);
}

function handleSelection(selectedText) {
    // Create all pages once
    currentPages = createPages(selectedText);
    currentPageIndex = 0;
    showPage(currentPageIndex);
}

function updateNavigation(currentIndex, totalPages) {
    const prevButton = document.querySelector('.prev-button');
    const nextButton = document.querySelector('.next-button');
    
    prevButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex === totalPages - 1;
    
    // Add event listeners
    prevButton.onclick = () => {
        if (currentIndex > 0) {
            currentPageIndex--;
            showPage(currentPageIndex);
        }
    };
    
    nextButton.onclick = () => {
        if (currentIndex < totalPages - 1) {
            currentPageIndex++;
            showPage(currentPageIndex);
        }
    };
}

function createHanziWriter(elementId, character, options) {
    return new Promise((resolve, reject) => {
        const target = document.getElementById(elementId);
        if (!target) {
            reject(new Error('Target element not found'));
            return;
        }

        try {
            const writer = HanziWriter.create(elementId, character, options);
            resolve(writer);
        } catch (error) {
            console.error('Error creating HanziWriter:', error);
            reject(error);
        }
    });
}

async function showStrokeOrderPopup(character, rect) {
    try {
        let existingPopup = document.getElementById('strokeOrderPopup');
        if (existingPopup) {
            existingPopup.remove();
        }

        const popup = document.createElement('div');
        popup.id = 'strokeOrderPopup';
        popup.className = 'stroke-order-popup';
        
        // Add a close button
        const closeButton = document.createElement('button');
        closeButton.className = 'stroke-order-close-button';
        closeButton.innerHTML = '×';
        closeButton.style.cssText = `
            position: absolute;
            right: 5px;
            top: 5px;
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #666;
            padding: 5px;
        `;
        
        const content = document.createElement('div');
        content.className = 'stroke-order-content';
        
        content.innerHTML = `
            <div id="stroke-order-writer" style="width: 200px; height: 200px;"></div>
            <div class="stroke-order-controls">
                <button class="stroke-order-button animate-button">Animate Strokes</button>
                <button class="stroke-order-button quiz-button">Practice Writing</button>
            </div>
        `;
        
        popup.appendChild(closeButton);
        popup.appendChild(content);
        document.body.appendChild(popup);

        // Position the popup
        const popupRect = popup.getBoundingClientRect();
        const left = Math.min(
            rect.left,
            window.innerWidth - popupRect.width - 20
        );
        const top = rect.bottom + 10;

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;

        // Create the writer instance
        const writer = await createHanziWriter('stroke-order-writer', character, {
            width: 200,
            height: 200,
            padding: 5,
            showOutline: true,
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 1000,
            strokeColor: '#333',
            outlineColor: '#DDD',
            drawingColor: '#333',
            drawingWidth: 4,
            showHintAfterMisses: 3,
            highlightOnComplete: true,
            highlightColor: '#AAF'
        });

        // Store the writer instance globally for cleanup
        window.currentWriter = writer;

        // Add button handlers
        const animateButton = content.querySelector('.animate-button');
        const quizButton = content.querySelector('.quiz-button');

        animateButton.addEventListener('click', (e) => {
            e.stopPropagation();
            writer.animateCharacter();
        });

        quizButton.addEventListener('click', (e) => {
            e.stopPropagation();
            writer.quiz({
                showHintAfterMisses: 3,
                onComplete: () => console.log('Quiz completed!'),
                onMistake: (strokeData) => console.log('Mistake on stroke:', strokeData.strokeNum),
                onCorrectStroke: (strokeData) => console.log('Correct stroke:', strokeData.strokeNum)
            });
        });

        // Add close button handler
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.currentWriter) {
                window.postMessage({ type: 'cleanupWriter' }, '*');
            }
            popup.remove();
        });

        // Add click handler to close popup when clicking outside
        const handleOutsideClick = (e) => {
            if (!popup.contains(e.target) && !e.target.closest('.translation-popup')) {
                if (window.currentWriter) {
                    window.postMessage({ type: 'cleanupWriter' }, '*');
                }
                popup.remove();
                document.removeEventListener('mousedown', handleOutsideClick);
            }
        };

        // Add the click listener
        document.addEventListener('mousedown', handleOutsideClick);

        // Start initial animation
        writer.animateCharacter();

    } catch (error) {
        console.error('Error in showStrokeOrderPopup:', error);
        const popup = document.getElementById('strokeOrderPopup');
        if (popup) {
            popup.innerHTML = `
                <div class="stroke-order-error">
                    Unable to load stroke order animation
                    <br>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }
}

// Add cleanup message handler
window.addEventListener('message', function(event) {
    if (event.data.type === 'cleanupWriter' && window.currentWriter) {
        delete window.currentWriter;
    }
});