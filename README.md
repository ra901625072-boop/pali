# CBDC Ration Portal

A web portal for managing CBDC (Central Bank Digital Currency) ration distribution. The project features a frontend hosted on **Vercel** and a backend API hosted on **Render**.

## Project Folder Structure

```
CBDCP/
├── backend/
│   ├── .env                  # Backend environment configuration (gitignored)
│   ├── .env.example          # Template for backend environment variables
│   ├── database.db           # SQLite database (gitignored)
│   ├── main.py               # FastAPI application
│   ├── seed.py               # Database seeding script
│   ├── requirements.txt      # Python dependencies for Render
│   ├── raw data.xlsx         # Reference raw data
│   └── reports/              # Generated reports directory
├── frontend/
│   ├── index.html            # Frontend entry point
│   ├── vercel.json           # Vercel deployment config (API routing rewrites)
│   └── assets/               # CSS, JS, Images, and JSON data fallbacks
├── .gitignore                # Root gitignore
└── README.md                 # Project README (this file)
```

---

## Local Development Setup

To run the project locally, you can start the backend FastAPI server, which is also configured to serve the static frontend files as a fallback.

1. **Navigate to the root directory**:
   ```bash
   cd CBDCP
   ```

2. **Install dependencies**:
   Create a virtual environment (optional but recommended) and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   pip install -r backend/requirements.txt
   ```

3. **Database Seeding**:
   If `backend/database.db` does not exist or you want to reset it, run:
   ```bash
   python backend/seed.py
   # To force re-seeding and overwrite current database:
   python backend/seed.py --force
   ```

4. **Run the server**:
   ```bash
   python backend/main.py
   ```
   This will start the FastAPI server at `http://127.0.0.1:8080`.
   Open the link in your browser to view the application.

---

## Deployment Instructions

### 1. Backend (on Render)

Deploy the `backend` folder as a **Web Service**:
- **Environment**: Python
- **Repository Root Directory**: `backend` (If setting it up as a separate project or setting the Root Directory setting in Render)
  - *Note:* Render allows configuring a custom Root Directory under Advanced settings.
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT` (or `python main.py` as it automatically detects Render and binds to host `0.0.0.0` and the correct port).
- **Environment Variables**:
  - `JWT_SECRET`: A secure key used to generate/sign JWT tokens (e.g. `your_custom_jwt_secret`).
  - `RENDER`: Set to `true` to enable production configurations.

### 2. Frontend (on Vercel)

Deploy the `frontend` folder to Vercel:
- **Framework Preset**: Other / None (since it is a static site)
- **Root Directory**: `frontend` (Ensure Vercel is pointed to the `frontend` subdirectory of your repository)
- **CORS API Proxy**:
  The `frontend/vercel.json` file is pre-configured to proxy `/api/...` requests directly to Render.
  Make sure to update `frontend/vercel.json` with your actual Render service URL:
  ```json
  {
    "cleanUrls": true,
    "rewrites": [
      {
        "source": "/api/:path*",
        "destination": "https://your-backend-render-url.onrender.com/api/:path*"
      }
    ]
  }
  ```
