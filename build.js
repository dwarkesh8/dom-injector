import fs from 'fs';
import path from 'path';
import { minify as minifyHTML } from 'html-minifier';
import CleanCSS from 'clean-css';
import { minify as terserMinify } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import dotenv from 'dotenv';

dotenv.config();

const allowedDomains = process.env.ALLOWED_DOMAINS
  ? process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim())
  : [];

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

// Domain check script
const domainCheck = `
(function(){
  const allowed = ${JSON.stringify(allowedDomains)};
  if (!allowed.includes(window.location.hostname)) {
    console.warn('DOM Injector blocked: Unauthorized domain');
    return;
  }
})();
`;

// Create final injector script
let injectorCode = `
${domainCheck}
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

// Obfuscate
const obfuscationResult = JavaScriptObfuscator.obfuscate(injectorCode, {
  compact: true,
  controlFlowFlattening: true,
  stringArray: true,
  rotateStringArray: true,
  stringArrayThreshold: 0.75
});

injectorCode = obfuscationResult.getObfuscatedCode();

// Save to build/injector.js
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/injector.js', injectorCode, 'utf-8');

// Write production HTML
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

console.log("✅ Build complete with obfuscation & domain restriction: build/injector.js");
