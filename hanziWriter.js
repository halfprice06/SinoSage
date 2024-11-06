// Store writer instances
const writers = new Map();

// Create a promise to track when HanziWriter is loaded
let hanziWriterLoaded = false;
let hanziWriterQueue = [];

function processQueue() {
    while (hanziWriterQueue.length > 0) {
        const { event } = hanziWriterQueue.shift();
        handleHanziWriterInit(event);
    }
}

function handleHanziWriterInit(event) {
    const { writerId, elementId, character, options } = event.detail;
    
    try {
        const writer = HanziWriter.create(elementId, character, options);
        writers.set(writerId, writer);
        
        // Notify that the writer is ready
        window.dispatchEvent(new CustomEvent('writerReady', {
            detail: { writerId }
        }));
    } catch (error) {
        console.error('Error creating HanziWriter:', error);
    }
}

// Listen for initialization events
window.addEventListener('initHanziWriter', function(event) {
    if (!hanziWriterLoaded) {
        hanziWriterQueue.push({ event });
        return;
    }
    handleHanziWriterInit(event);
});

// Listen for writer commands
window.addEventListener('writerCommand', function(event) {
    const { writerId, command, options } = event.detail;
    const writer = writers.get(writerId);
    
    if (writer) {
        switch (command) {
            case 'animate':
                writer.animateCharacter();
                break;
            case 'quiz':
                writer.quiz({
                    showHintAfterMisses: options?.showHintAfterMisses || 3,
                    onComplete: options?.onComplete,
                    onMistake: options?.onMistake,
                    onCorrectStroke: options?.onCorrectStroke
                });
                break;
        }
    }
});

// Cleanup function
window.addEventListener('writerCleanup', function(event) {
    const { writerId } = event.detail;
    writers.delete(writerId);
});

// Wait for HanziWriter to be loaded
const checkHanziWriter = setInterval(() => {
    if (window.HanziWriter) {
        hanziWriterLoaded = true;
        clearInterval(checkHanziWriter);
        processQueue();
    }
}, 50); 