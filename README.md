# Sidekick - AI-Powered Career Acceleration Tool

Sidekick is a dual-architecture career acceleration platform featuring a modern web application and a privacy-first Chrome Extension. It helps users automatically apply to jobs using their local profile data and advanced AI processing, without permanently storing Personally Identifiable Information (PII) on external servers.

## Features

- **Stateless Chrome Extension:** Operates directly inside the browser, extracting resume data and auto-filling job applications on major ATS platforms (Workday, Greenhouse, Lever, etc.).
- **Privacy-First Design:** Profile data is securely stored in `chrome.storage.local`. No databases are used for the extension's auto-fill logic.
- **Human-in-the-Loop Auto-Fill:** The bot populates complex forms but enforces a strict hard-stop, explicitly refusing to click "Submit" automatically, allowing users to safely review all applications.
- **Premium UI/UX:** Built with Tailwind CSS v4, featuring glassmorphism, dynamic micro-animations, and a responsive dark theme across both the extension and web dashboard.
- **Job Board Scraping Backend:** A FastAPI backend designed to scrape current jobs from multiple platforms (LinkedIn, Naukri, Glassdoor, etc.) and proxy AI requests.

## Architecture

- **Extension (`/extension`):** Manifest V3 Chrome Extension containing content scripts, background service workers, and a Tailwind-styled popup UI.
- **Backend (`server.py`):** FastAPI application acting as a proxy for the Gemini API and hosting the main web dashboard.
- **Frontend (`/static`, `index.html`):** Clean, modern web interfaces served by the backend.

## Installation

### Prerequisites
- Python 3.10+
- Google Chrome browser

### Setting up the Web Server
1. Clone the repository:
   ```bash
   git clone https://github.com/Shreyxpatil/SideKick.git
   cd SideKick
   ```
2. Set up the virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up environment variables:
   Create a `.env` file in the root directory and add your API keys:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   ```
5. Run the server:
   ```bash
   ./run.sh
   # Or manually: uvicorn server:app --reload
   ```

### Installing the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode" in the top right corner.
3. Click "Load unpacked".
4. Select the `extension/` directory from this repository.
5. The Sidekick extension is now ready to use!

## Usage

1. **Set up your profile:** Open the Chrome Extension or the web dashboard and enter your personal information, resume data, and API keys. This data is saved locally.
2. **Find Jobs:** Use the web dashboard (`http://localhost:8000`) to scrape and search for relevant jobs across various platforms.
3. **Auto-Apply:** Navigate to any supported job application page (e.g., a Workday application). Open the Sidekick Chrome Extension and click "Inject Local Profile".
4. **Review and Submit:** Review the automatically filled fields and manually click the final "Submit" button on the application.

## Legal Disclaimer

This tool operates purely as a typing assistant. You are responsible for reviewing all applications before submission. The extension will never automatically submit an application on your behalf.

## License

MIT License
