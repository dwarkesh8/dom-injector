import fs from 'fs';
import { minify as minifyHTML } from 'html-minifier';
import CleanCSS from 'clean-css';
import { minify as terserMinify } from 'terser';

// Read source files
const html = fs.readFileSync('src/index.html', 'utf-8');
const css = fs.readFileSync('src/styles.css', 'utf-8');
const js = fs.readFileSync('src/script.js', 'utf-8');

// Minify
const minHTML = minifyHTML(html, {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true
});
const minCSS = new CleanCSS().minify(css).styles;
const minJS = (await terserMinify(js)).code;

// Escape backticks in HTML
const safeHTML = minHTML.replace(/`/g, '\\`');

// Create final injector script
const injectorCode = `
(function(){
  const style = document.createElement('style');
  style.innerHTML = \`${minCSS}\`;
  document.head.appendChild(style);

  const container = document.createElement('div');
  container.innerHTML = \`${safeHTML}\`;
  document.body.appendChild(container);

  ${minJS}
})();
`;

// Ensure build folder
fs.mkdirSync('build', { recursive: true });

// Write injector.js
fs.writeFileSync('build/injector.js', injectorCode, 'utf-8');

// Write production index.html
const prodHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>DOM Injector Demo</title>
</head>
<body>
  <script src="./injector.js"></script>
</body>
</html>`;
fs.writeFileSync('build/index.html', prodHTML, 'utf-8');

console.log("✅ Build complete:");
console.log("- build/injector.js");
console.log("- build/index.html");
