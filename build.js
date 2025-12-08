/**
 * LiveBlade Build Script
 * Comment/uncomment files to customize your build
 *
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');
const version = '1.0.2';

// ===========================================
// CUSTOMIZE YOUR BUILD HERE
// Comment/uncomment files as needed
// ===========================================
const files = [
    // Core (always required)
    'src/core.js',
    'src/features/html-controller.js',

    // Infrastructure
    'src/features/rate-limiter.js',
    'src/features/state.js',

    // Binders
    'src/features/html.js',
    'src/features/nav.js',
    'src/features/search.js',
    'src/features/filter.js',
    'src/features/sort.js',
    'src/features/button.js',
    'src/features/toggle.js',
    'src/features/data.js',
    'src/features/pagination.js',
    'src/features/quick-search.js',
    'src/features/cascade.js',
    'src/features/confirm.js',
    'src/features/rating.js',
    'src/features/word-counter.js',
    'src/features/forms.js',
    'src/features/toast.js',


    // Optional Features (uncomment to enable) ||  under development phase
    // 'src/features/modals.js',
    // 'src/features/inline-edit.js',
    // 'src/features/bulk-actions.js',
];

const cssfiles = [
    'src/liveblade.css',
]

// ===========================================
// BUILD (no need to edit below)
// ===========================================
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

console.log('LiveBlade Build');
console.log('================\n');

let output = `/*!
 * LiveBlade v${version}
 * Production-ready AJAX for Laravel Blade
 * @license MIT
 *
 * Included:
${files.map(f => ' *   - ' + path.basename(f, '.js')).join('\n')}
 */

`;

let fileCount = 0;
files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/\/\*![\s\S]*?\*\/\s*/g, '');
        content = content.replace(/\/\*\*[\s\S]*?@license[\s\S]*?\*\/\s*/g, '');

        output += `\n// ============================================================\n`;
        output += `// ${path.basename(file)}\n`;
        output += `// ============================================================\n`;
        output += content + '\n';
        fileCount++;
        console.log(`  ✓ ${file}`);
    } else {
        console.log(`  ✗ ${file} (not found)`);
    }
});

// Write output
fs.writeFileSync(path.join(distDir, 'liveblade.js'), output);
console.log(`\n→ dist/liveblade.js (${fileCount} files, ${(output.length / 1024).toFixed(1)}KB)`);

// Minify if terser available
try {
    const { minify } = require('terser');
    minify(output, {
        compress: { drop_debugger: true },
        mangle: true,
        format: { comments: /^!/ }
    }).then(result => {
        fs.writeFileSync(path.join(distDir, 'liveblade.min.js'), result.code);
        console.log(`→ dist/liveblade.min.js (${(result.code.length / 1024).toFixed(1)}KB)`);
    });
} catch (e) {
    console.log('\n⚠ Run "npm install terser" for minification');
}



// ===========================================
// CSS BUILD
// ===========================================
const cssInput = path.join(__dirname, 'src/liveblade.css');
if (fs.existsSync(cssInput)) {
    const css = fs.readFileSync(cssInput, 'utf8');
    
    // Copy to dist
    fs.writeFileSync(path.join(distDir, 'liveblade.css'), css);
    console.log(`\n→ dist/liveblade.css (${(css.length / 1024).toFixed(1)}KB)`);
    
    // Minify if clean-css available
    try {
        const CleanCSS = require('clean-css');
        const minified = new CleanCSS({}).minify(css);
        fs.writeFileSync(path.join(distDir, 'liveblade.min.css'), minified.styles);
        console.log(`→ dist/liveblade.min.css (${(minified.styles.length / 1024).toFixed(1)}KB)`);
    } catch (e) {
        console.log('\n⚠ Run "npm install clean-css" for CSS minification');
    }
}