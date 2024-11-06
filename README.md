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

- Powered by OpenAI's GPT-4 for accurate translations
- Uses [HanziWriter](https://hanziwriter.org/) for stroke order animations and writing practice
- Implements character-by-character alignment for accurate translations
- Supports both simplified and traditional Chinese characters
- Handles tone marks and pinyin conversion automatically

## Credits

- Stroke order animations and writing practice powered by [HanziWriter](https://github.com/chanind/hanzi-writer), released under MIT License
- Character data derived from the Make Me A Hanzi project, which uses data from Arphic Technology fonts
- Translation and audio services provided by OpenAI

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-Party Licenses

- **HanziWriter**: MIT License
- **Character Data**: The character data used by HanziWriter comes from the Make Me A Hanzi project, which extracted data from fonts by Arphic Technology. This data is licensed under the Arphic Public License.
