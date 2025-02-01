const fs = require('fs').promises;
const path = require('path');
const { DocumentAnalyzer } = require('../server/services/DocumentAnalyzer');
const { LayoutExtractor } = require('../server/services/LayoutExtractor');
const { TextExtractor } = require('../server/services/TextExtractor');
const { Translator } = require('../server/services/Translator');
const { DocumentGenerator } = require('../server/services/DocumentGenerator');

async function testComponents() {
    try {
        console.log('Starting components test...\n');

        // 1. Load test file
        console.log('1. Loading test file...');
        const testFilePath = path.join(__dirname, '..', 'tests', 'test-data', 'sample.txt');
        const content = await fs.readFile(testFilePath, 'utf8');
        console.log('✓ File loaded successfully\n');

        // 2. Document Analysis
        console.log('2. Analyzing document...');
        const analyzer = new DocumentAnalyzer();
        const analysisResult = await analyzer.analyze(content);
        console.log('Analysis result:', analysisResult);
        console.log('✓ Document analyzed\n');

        // 3. Extract Layout
        console.log('3. Extracting layout...');
        const layoutExtractor = new LayoutExtractor();
        const layout = await layoutExtractor.extract(content);
        console.log('Layout:', layout);
        console.log('✓ Layout extracted\n');

        // 4. Extract Text
        console.log('4. Extracting text...');
        const textExtractor = new TextExtractor();
        const extractedText = await textExtractor.extract(content);
        console.log('Extracted text:', extractedText);
        console.log('✓ Text extracted\n');

        // 5. Translation
        console.log('5. Translating content...');
        const translator = new Translator();
        
        console.log('5.1. Testing basic translation...');
        const translatedText = await translator.translate(extractedText, 'he', 'en');
        console.log('Translated text:', translatedText);
        
        console.log('5.2. Testing rate limiting...');
        const promises = Array(5).fill().map(() => 
            translator.translate('שלום', 'he', 'en')
        );
        const results = await Promise.allSettled(promises);
        console.log('Rate limiting test results:', 
            results.map(r => r.status === 'fulfilled' ? 'Success' : 'Rate limited')
        );
        console.log('✓ Translation tests complete\n');

        // 6. Document Generation
        console.log('6. Generating final document...');
        const generator = new DocumentGenerator();
        const finalDocument = await generator.generate({
            originalContent: content,
            translatedContent: translatedText,
            layout: layout
        });
        console.log('Final document:', finalDocument);
        console.log('✓ Document generated\n');

        // 7. Save results
        console.log('7. Saving test results...');
        const resultsDir = path.join(__dirname, '..', 'tests', 'results');
        await fs.mkdir(resultsDir, { recursive: true });
        
        const results = {
            analysis: analysisResult,
            layout,
            extractedText,
            translatedText,
            finalDocument
        };
        
        await fs.writeFile(
            path.join(resultsDir, 'test-results.json'),
            JSON.stringify(results, null, 2)
        );
        console.log('✓ Results saved to tests/results/test-results.json\n');

        console.log('All components tested successfully! 🎉');
    } catch (error) {
        console.error('Error during testing:', error);
        process.exit(1);
    }
}

// Run tests
testComponents();
