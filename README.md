# DOM Injector

A minimal Node.js-based tool that takes plain HTML, CSS, and JavaScript files, minifies them, and outputs a single injectable script (`injector.js`) that dynamically renders your UI in the browser.  
Great for hiding your source HTML from the initial page load while keeping it functional.  
Now supports **domain restriction** so the injector works only on specified domains.

---

## Requirements
- Node.js (LTS version recommended)
- npm (comes with Node.js)

---

## Getting Started

### 1. Clone the Repository
```sh
git clone https://github.com/your-username/dom-injector.git
cd dom-injector
````

### 2. Install Dependencies

```sh
npm install
```

### 3. Configure Allowed Domains

Create a `.env` file in the project root:

```env
ALLOWED_DOMAINS=example.com,sub.example.com,localhost
```

* Multiple domains are separated by commas.
* If the current domain is not in the allowed list, the injector will not run.

---




### 4. Build the Injector

Before building, don't forget to add the frontend code inside `src/`

```sh
npm run build
```

This will:

* Read files from `src/` (`index.html`, `styles.css`, `script.js`)
* Minify HTML, CSS, and JS
* Bundle them into a single `injector.js` file in the `build/` folder
* Generate a `build/index.html` file that loads the injector
* Include domain restriction logic based on `.env`

---

### 5. Serve the Project Locally

To preview your build:

```sh
npm run serve
```

Then open your browser and go to:

```
http://localhost:3000
```

---

## Project Structure

```
dom-injector/
│
├── src/
│   ├── index.html   # Your HTML
│   ├── styles.css   # Your CSS
│   └── script.js    # Your JS
│
├── build/
│   ├── injector.js  # Final compiled & minified script
│   └── index.html   # Production HTML loading injector.js
│
├── build.js         # Node.js build script
├── .env             # Allowed domains configuration
├── package.json     # Project metadata & scripts
└── README.md
```

---

## Customization

* Edit files inside `src/` to change your HTML, CSS, and JS.
* Modify `.env` to control which domains can execute the injector.
* Run `npm run build` again to generate the updated build.

---

## License

MIT License