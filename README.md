# SinoSage (name in progress)

A powerful Chrome extension that helps users learn Chinese by providing instant translations, pinyin, pronunciation, and stroke order practice for Chinese characters.

## Features

- **Instant Translation**: Select Chinese text to see character-by-character translations
- **Pinyin Display**: Shows pinyin with tone marks for each character
- **Audio Pronunciation**: Listen to accurate pronunciations of selected text
- **Stroke Order Practice**: Interactive stroke order diagrams with animation and practice mode
- **Smart Pagination**: Efficiently handles long selections of text
- **Character-by-Character Learning**: Break down complex texts into manageable pieces

## Installation

1. Clone this repository. 
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Usage

1. Select any Chinese text on a webpage
2. A popup will appear showing:
   - Individual character translations
   - Pinyin with tone marks
   - English translations
   - Pronunciation audio
3. Click on any character to see its stroke order and practice writing
4. Use the pagination controls for longer selections
5. Click the speaker icon to hear pronunciations

## Requirements

- Google Chrome browser
- OpenAI API key for translation and audio services (see Configuration section)

## Configuration

1. After installation, click the extension icon
2. Enter your OpenAI API key in the settings
3. The extension will automatically save your settings

## Technical Details

- Uses HanziWriter for stroke order animations
- Implements character-by-character alignment for accurate translations
- Supports both simplified and traditional Chinese characters
- Handles tone marks and pinyin conversion automatically

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
