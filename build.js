import fs from "fs";
import path from "path";
import { minify as minifyHTML } from "html-minifier";
import CleanCSS from "clean-css";
import { minify as terserMinify } from "terser";
import CryptoJS from "crypto-js";
import JavaScriptObfuscator from "javascript-obfuscator";
import dotenv from "dotenv";

dotenv.config();

const SRC = path.resolve(process.env.SRC_DIR || "src");
const BUILD = path.resolve(process.env.BUILD_DIR || "build");
const PASSPHRASE = process.env.PASSPHRASE || process.env.SECRET_KEY || "change_this_passphrase";
const CRYPTOJS_RUNTIME_PATH = path.join("node_modules", "crypto-js", "crypto-js.js");

const ensure = dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
const rmrf = dir => { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); };
const readIf = p => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
const write = (p, d) => { ensure(path.dirname(p)); fs.writeFileSync(p, d, "utf8"); };
const isExternal = u => /^https?:\/\//i.test(u);
const stripQuery = u => u.split("?")[0];

// copy static assets except css & js
function copyStaticSkipCSSJS(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, ent.name);
    const d = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      // skip css and js directories (we'll write protected versions)
      if (ent.name.toLowerCase() === "css" || ent.name.toLowerCase() === "js") continue;
      ensure(d);
      copyStaticSkipCSSJS(s, d);
    } else {
      if (!ent.name.endsWith(".html")) {
        ensure(path.dirname(d));
        fs.copyFileSync(s, d);
      }
    }
  }
}

async function build() {
  // sanity
  const cryptoRuntime = readIf(CRYPTOJS_RUNTIME_PATH);
  if (!cryptoRuntime) {
    console.error("Missing crypto-js runtime. Run: npm install crypto-js");
    process.exit(1);
  }

  rmrf(BUILD);
  ensure(BUILD);
  copyStaticSkipCSSJS(SRC, BUILD);
  ensure(path.join(BUILD, "css"));
  ensure(path.join(BUILD, "js"));

  // find HTML pages
  const pages = fs.readdirSync(SRC).filter(f => f.endsWith(".html"));
  if (pages.length === 0) {
    console.warn("No HTML pages found in src/");
    return;
  }

  for (const page of pages) {
    const srcPath = path.join(SRC, page);
    const raw = fs.readFileSync(srcPath, "utf8");

    // extract head and body
    const headMatch = raw.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    const headContent = headMatch ? headMatch[1] : "";
    let bodyInner = bodyMatch ? bodyMatch[1] : "";

    // collect local CSS links from head (non-external)
    const localCss = [];
    for (const m of headContent.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/ig)) {
      const href = m[1];
      if (!isExternal(href)) localCss.push(stripQuery(href));
    }

    // collect scripts from entire HTML in original order, split external vs local
    const externalScripts = []; // keep original external order
    const localScriptsOrdered = []; // local files (strip query)
    for (const m of raw.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>(?:<\/script>)?/ig)) {
      const src = m[1];
      if (isExternal(src)) externalScripts.push(src);
      else localScriptsOrdered.push(stripQuery(src));
    }

    // remove local script tags from body (we will handle local ones via injector)
    bodyInner = bodyInner.replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/ig, "");

    // extract inline body scripts and remove them from body
    const inlineBodyScripts = [];
    for (const m of bodyInner.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/ig)) {
      const code = m[1] || "";
      if (code.trim()) inlineBodyScripts.push(code);
      bodyInner = bodyInner.replace(m[0], "");
    }

    // 1) Process local CSS: minify & write to build/css/<basename>
    let combinedMinifiedCSS = "";
    for (const cssRel of localCss) {
      const cssSrcPath = path.join(SRC, cssRel);
      const cssRaw = readIf(cssSrcPath);
      if (!cssRaw) {
        // silently skip missing
        continue;
      }
      const cssMin = new CleanCSS().minify(cssRaw).styles;
      combinedMinifiedCSS += cssMin + "\n";
      // write minified CSS to build/css/<basename>
      const outCss = path.join(BUILD, "css", path.basename(cssRel));
      write(outCss, cssMin);
    }

    // 2) Process local JS: obfuscate -> minify -> encrypt -> write to build/js/<basename>
    const encryptedBlobs = [];
    for (const jsRel of localScriptsOrdered) {
      const jsSrcPath = path.join(SRC, jsRel);
      const jsRaw = readIf(jsSrcPath);
      if (!jsRaw) continue;

      // obfuscate (best-effort)
      let obf;
      try {
        obf = JavaScriptObfuscator.obfuscate(jsRaw, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          numbersToExpressions: true,
          simplify: true,
          splitStrings: true,
          stringArray: true,
          stringArrayEncoding: ['rc4'],
          stringArrayThreshold: 0.75
        }).getObfuscatedCode();
      } catch (e) {
        obf = jsRaw;
      }

      // minify
      let minified;
      try {
        const res = await terserMinify(obf, { compress: true, mangle: true });
        minified = (res && res.code) ? res.code : obf;
      } catch (e) {
        minified = obf;
      }

      // encrypt (AES via CryptoJS)
      const enc = CryptoJS.AES.encrypt(minified, PASSPHRASE).toString();

      // write encrypted content to build/js/<basename>
      const outJs = path.join(BUILD, "js", path.basename(jsRel));
      write(outJs, enc);

      // add to blobs for embedding in runtime injector
      encryptedBlobs.push({ name: path.basename(jsRel), enc });
    }

    // also process inline body scripts similarly and write as __inline_x.js in build/js
    for (let i = 0; i < inlineBodyScripts.length; ++i) {
      const code = inlineBodyScripts[i];
      let obf;
      try {
        obf = JavaScriptObfuscator.obfuscate(code, { compact: true }).getObfuscatedCode();
      } catch (e) {
        obf = code;
      }
      let minified;
      try {
        const res = await terserMinify(obf, { compress: true, mangle: true });
        minified = (res && res.code) ? res.code : obf;
      } catch (e) {
        minified = obf;
      }
      const enc = CryptoJS.AES.encrypt(minified, PASSPHRASE).toString();
      const inlineName = `__inline_${i}.js`;
      write(path.join(BUILD, "js", inlineName), enc);
      encryptedBlobs.push({ name: inlineName, enc });
    }

    // 3) Minify body HTML (without scripts)
    let bodyMin = "";
    try {
      bodyMin = minifyHTML(bodyInner || "", { collapseWhitespace: true, removeComments: true });
    } catch (e) {
      bodyMin = bodyInner || "";
    }

    // 4) Prepare runtime payload (will be minified + encrypted and wrapped)
    const allowed = (process.env.ALLOWED_DOMAINS || "localhost").split(",").map(s => s.trim()).filter(Boolean);
    const obfAllowed = allowed.map(d => Buffer.from(d, "utf8").toString("base64").split("").reverse().join(""));

    // runtime plain: inject CSS, set #root innerHTML, decrypt+execute blobs sequentially
    const runtimePlain = `
      (function(){
        var ob = ${JSON.stringify(obfAllowed)};
        var allowed = ob.map(function(s){ return atob(s.split('').reverse().join('')); });
        if(allowed.length && allowed.indexOf(window.location.hostname) === -1){
          document.body.innerHTML = '<h1>Access Denied</h1>'; return;
        }
        function whenReady(cb){
          if(document.readyState === 'complete') return cb();
          var done=false;
          window.addEventListener('load', function(){ if(!done){ done=true; cb(); }});
          setTimeout(function(){ if(!done){ done=true; cb(); }}, 2500);
        }
        whenReady(function(){
          try {
      var css = \`${(combinedMinifiedCSS || "").replace(/`/g, "\\`")}\`;
            if(css && css.length){
              var s = document.createElement('style'); s.innerHTML = css; document.head.appendChild(s);
            }
          } catch(e){}
          if(!document.getElementById('root')) {
            var r = document.createElement('div'); r.id = 'root'; document.body.appendChild(r);
          }
      try { document.getElementById('root').innerHTML = \`${bodyMin.replace(/`/g,"\\`")}\`; } catch(e){}
          var blobs = ${JSON.stringify(encryptedBlobs)};
          (function run(i){
            if(i >= blobs.length) return;
            try {
              var enc = blobs[i].enc;
              var dec = CryptoJS.AES.decrypt(enc, "${PASSPHRASE}").toString(CryptoJS.enc.Utf8);
              (new Function(dec))();
            } catch(e){}
            setTimeout(function(){ run(i+1); }, 40);
          })(0);
        });
      })();
    `;

    // minify & encrypt runtime
    let runtimeMin;
    try {
      const res = await terserMinify(runtimePlain, { compress: true, mangle: true });
      runtimeMin = (res && res.code) ? res.code : runtimePlain;
    } catch (e) {
      runtimeMin = runtimePlain;
    }
    const runtimeEncrypted = CryptoJS.AES.encrypt(runtimeMin, PASSPHRASE).toString();

    // wrapper: include crypto-js runtime then decrypt runtimeEncrypted and eval
    const wrapper = `
      ${cryptoRuntime}
      (function(){
        try {
          var dec = CryptoJS.AES.decrypt("${runtimeEncrypted}", "${PASSPHRASE}").toString(CryptoJS.enc.Utf8);
          (new Function(dec))();
        } catch(e) {
          document.body.innerHTML = '<h1>Access Denied</h1>';
        }
      })();
    `;
    // minify wrapper
    let wrapperMin;
    try {
      const res = await terserMinify(wrapper, { compress: true, mangle: true });
      wrapperMin = (res && res.code) ? res.code : wrapper;
    } catch (e) {
      wrapperMin = wrapper;
    }

    const pageName = path.basename(page, ".html");
    const injectorName = `injector-${pageName}.js`;
    write(path.join(BUILD, injectorName), wrapperMin);

    // 5) Reconstruct final HTML: keep head as-is, put external scripts before injector
    const externalScriptTags = externalScripts.map(url => `<script src="${url}"></script>`).join("\n");
    const finalHtml = `<!doctype html>
<html>
<head>
    ${headContent}
</head>
<body>
  <div id="root"></div>
  ${externalScriptTags}
  <script src="./${injectorName}"></script>
</body>
    </html>`;
    write(path.join(BUILD, page), finalHtml);
  } // end pages

  console.log("Build completed. Serve 'build/' folder (e.g. npx serve build)");
} // end build

build().catch(err => {
  console.error("Build error:", err);
  process.exit(1);
});
