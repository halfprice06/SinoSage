const MAX_POPUP_WIDTH = '1000px';  // Maximum width for long content
const MIN_POPUP_WIDTH = '300px';   // Minimum width for short content
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
    // Center the popup in the viewport horizontally
    const viewportWidth = window.innerWidth;
    const popupWidth = Math.min(
        popup.offsetWidth,
        parseInt(MAX_POPUP_WIDTH)
    );
    
    // Center horizontally in viewport
    let leftPosition = (viewportWidth - popupWidth) / 2;
    
    // Ensure minimum margins
    leftPosition = Math.max(10, leftPosition);
    leftPosition = Math.min(leftPosition, viewportWidth - popupWidth - 10);
    
    // Position vertically relative to the selection
    // Use absolute positioning instead of fixed to move with scroll
    let topPosition = window.pageYOffset + rect.bottom + 5;

    // Set absolute positioning
    popup.style.position = 'absolute';
    popup.style.left = `${leftPosition}px`;
    popup.style.top = `${topPosition}px`;
}

function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    // Create drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    element.insertBefore(dragHandle, element.firstChild);

    // Track whether we're dragging
    let isDragging = false;

    function dragMouseDown(e) {
        e.preventDefault();
        
        // Get the mouse cursor position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        isDragging = true;

        // Add the event listeners
        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('mouseup', closeDragElement);
    }

    function elementDrag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        
        // Calculate the new cursor position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        // Set the element's new position
        const newTop = element.offsetTop - pos2;
        const newLeft = element.offsetLeft - pos1;

        // Keep popup within viewport bounds
        const maxX = window.innerWidth - element.offsetWidth;
        const maxY = window.innerHeight - element.offsetHeight;

        element.style.top = `${Math.min(Math.max(0, newTop), maxY)}px`;
        element.style.left = `${Math.min(Math.max(0, newLeft), maxX)}px`;
    }

    function closeDragElement() {
        isDragging = false;
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('mouseup', closeDragElement);
    }

    // Add mousedown event listener to drag handle
    dragHandle.addEventListener('mousedown', dragMouseDown);
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
        <div id="fullTranslationContainer" class="full-translation-container hidden">
            <div id="fullTranslation" class="full-translation"></div>
        </div>
        <div style="text-align: center; margin-top: 10px;">
            <button id="toggleFullTranslationButton" disabled>Loading full translation...</button>
        </div>
        <div style="text-align: center; margin-top: 10px;">
            <button id="playAudioButton" disabled>Loading pronunciation...</button>
        </div>
    `;

    document.body.appendChild(popup);

    // Make the popup draggable
    makeDraggable(popup);

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
        
        // Set items per page to be just one row worth of items (removed the * 2)
        itemsPerPage = Math.min(itemsPerRow, allTuples.length);
        
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
        
        // Create a container for the English translation, hidden initially
        const englishContainer = document.createElement('div');
        englishContainer.className = 'english-container hidden';

        const englishDiv = document.createElement('div');
        englishDiv.className = 'english';
        englishDiv.textContent = tuple.english;
        englishContainer.appendChild(englishDiv);
        div.appendChild(englishContainer);

        // Add a button to reveal the translation
        const revealButton = document.createElement('button');
        revealButton.className = 'reveal-button';
        revealButton.textContent = 'Show Translation';
        div.appendChild(revealButton);

        // Add click event listener to toggle the English translation visibility
        revealButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            if (englishContainer.classList.contains('hidden')) {
                englishContainer.classList.remove('hidden');
                revealButton.textContent = 'Hide Translation';
            } else {
                englishContainer.classList.add('hidden');
                revealButton.textContent = 'Show Translation';
            }
        });

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
                
                // Update the full translation and hide it initially
                const fullTranslationDiv = document.getElementById('fullTranslation');
                if (fullTranslationDiv && toggleFullTranslationButton && fullTranslationContainer) {
                    fullTranslationDiv.innerHTML = `"${translationData.full_translation}"`;
                    fullTranslationDiv.style.display = 'block';
                    fullTranslationContainer.classList.add('hidden'); // Ensure it's hidden initially
                    toggleFullTranslationButton.textContent = 'Show Full Translation';
                    toggleFullTranslationButton.disabled = false;
                }

                // Add click event listener to toggle the full translation visibility
                toggleFullTranslationButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent event bubbling
                    if (fullTranslationContainer.classList.contains('hidden')) {
                        fullTranslationContainer.classList.remove('hidden');
                        toggleFullTranslationButton.textContent = 'Hide Full Translation';
                    } else {
                        fullTranslationContainer.classList.add('hidden');
                        toggleFullTranslationButton.textContent = 'Show Full Translation';
                    }
                });
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
    // Check if the selection is inside either popup
    const translationPopup = document.getElementById('translationPopup');
    const strokeOrderPopup = document.getElementById('strokeOrderPopup');
    
    if ((translationPopup && translationPopup.contains(event.target)) || 
        (strokeOrderPopup && strokeOrderPopup.contains(event.target))) {
        return; // Don't create a new popup if selecting inside existing popups
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

        const mainPopup = document.getElementById('translationPopup');
        if (!mainPopup) return;

        const popup = document.createElement('div');
        popup.id = 'strokeOrderPopup';
        popup.className = 'stroke-order-popup';
        
        // Add a close button
        const closeButton = document.createElement('button');
        closeButton.className = 'stroke-order-close-button';
        closeButton.innerHTML = '×';
        
        // Create a flex container for stroke order and decomposition
        const content = document.createElement('div');
        content.className = 'stroke-order-content';
        
        // Get character data from dictionary
        const charData = dictionaryData[character] || {};
        
        content.innerHTML = `
            <div class="stroke-order-section">
                <div class="stroke-order-title">Stroke Order</div>
                <div id="stroke-order-writer"></div>
                <div class="stroke-order-controls">
                    <button class="stroke-order-button animate-button">Animate</button>
                    <button class="stroke-order-button quiz-button">Practice</button>
                </div>
            </div>
            <div class="character-analysis-section">
                <div class="character-info">
                    <div class="big-character">${character}</div>
                    <div class="character-details">
                        <div class="detail-item">
                            <span class="detail-label">Radical</span>
                            <span class="detail-value">${charData.radical || '?'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Components</span>
                            <span class="detail-value">${charData.decomposition || '?'}</span>
                        </div>
                        ${charData.etymology ? `
                            <div class="detail-item etymology">
                                <span class="detail-label">Etymology</span>
                                <span class="detail-value">${charData.etymology.hint || ''}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        popup.appendChild(closeButton);
        popup.appendChild(content);
        document.body.appendChild(popup);

        // Make the popup draggable
        makeDraggable(popup);

        // Position the stroke order popup relative to the main popup
        const mainPopupRect = mainPopup.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();

        // Center the stroke order popup horizontally relative to the main popup
        const left = mainPopupRect.left + (mainPopupRect.width - popupRect.width) / 2;
        
        // Position vertically below the clicked character
        const top = window.pageYOffset + rect.bottom + 10;

        // Ensure the popup stays within viewport bounds
        const adjustedLeft = Math.max(10, Math.min(left, window.innerWidth - popupRect.width - 10));

        popup.style.position = 'absolute';
        popup.style.left = `${adjustedLeft}px`;
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
            writer.quiz();
        });

        // Add close button handler
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.currentWriter) {
                window.postMessage({ type: 'cleanupWriter' }, '*');
            }
            popup.remove();
        });

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

// Function to load the dictionary data
async function loadDictionaryData() {
    const response = await fetch(chrome.runtime.getURL('data/dictionary.txt'));
    const text = await response.text();
    const lines = text.trim().split('\n');
    const dictionary = {};
    for (const line of lines) {
        const entry = JSON.parse(line);
        dictionary[entry.character] = entry;
    }
    return dictionary;
}

// Variable to store the dictionary data
let dictionaryData = {};

// Load the dictionary data when the script initializes
loadDictionaryData().then(data => {
    dictionaryData = data;
});

// Add scroll event listener to reposition popups when scrolling
let scrollTimeout;
window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        const mainPopup = document.getElementById('translationPopup');
        const strokePopup = document.getElementById('strokeOrderPopup');
        
        if (mainPopup) {
            // Update main popup position
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                positionPopup(mainPopup, rect);
            }
        }
        
        if (strokePopup && mainPopup) {
            // Update stroke order popup position to maintain alignment with main popup
            const mainPopupRect = mainPopup.getBoundingClientRect();
            const strokePopupRect = strokePopup.getBoundingClientRect();
            const left = mainPopupRect.left + (mainPopupRect.width - strokePopupRect.width) / 2;
            const adjustedLeft = Math.max(10, Math.min(left, window.innerWidth - strokePopupRect.width - 10));
            
            strokePopup.style.left = `${adjustedLeft}px`;
            strokePopup.style.top = `${window.pageYOffset + mainPopupRect.bottom + 10}px`;
        }
    }, 16); // Debounce scroll events
});