# 🧠 AI Knowledge Assistant — Production RAG System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon_Cloud-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Groq API](https://img.shields.io/badge/LLM-Groq_Cloud-F34E3A?style=flat-square&logo=groq&logoColor=white)](https://groq.com/)
[![Transformers.js](https://img.shields.io/badge/Embeddings-Transformers.js-FF6F00?style=flat-square&logo=huggingface&logoColor=white)](https://huggingface.co/docs/transformers.js)

> A full-stack **Retrieval-Augmented Generation (RAG)** system built with React 19, Node.js/Express in TypeScript, local HuggingFace embeddings via `@xenova/transformers`, vector storage, PostgreSQL database, and high-speed LLM inference powered by **Groq Cloud**.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture & System Flow](#-architecture--system-flow)
- [Tech Stack](#-tech-stack)
- [Repository Structure](#-repository-structure)
- [Prerequisites](#-prerequisites)
- [Environment Configuration](#-environment-configuration)
- [Getting Started](#-getting-started)
- [API Documentation](#-api-documentation)
- [Frontend Overview](#-frontend-overview)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## 🌟 Overview

The **AI Knowledge Assistant** enables users to upload custom documents (PDFs, text files, markdown) and interact with them in real-time through an intelligent chat interface. 

Instead of sending raw document text directly to an LLM, the system processes documents into semantic chunks, generates vector embeddings locally using ONNX neural models, stores them in a vector database, and dynamically injects relevant context into LLM queries using Groq's high-speed inference engine.

---

## ✨ Key Features

- **📄 Document Parsing & Ingestion**: Extract clean text from multi-page PDFs, Markdown, and TXT files using `pdf-parse` and `multer`.
- **✂️ Token-Aware Chunking**: Intelligent sliding-window text chunking with configurable overlap and precise token estimation using OpenAI's `tiktoken`.
- **🔤 Local Neural Embeddings**: Zero embedding API cost using HuggingFace ONNX models (`Xenova/all-MiniLM-L6-v2`) executed locally in Node.js via `@xenova/transformers`.
- **🗄️ Dual Vector Search Engine**: Full ChromaDB integration with automatic fallback to an in-memory/JSON cosine similarity vector store for zero-setup deployment.
- **⚡ Ultra-Fast Groq Inference**: Sub-second context-grounded response generation utilizing Groq's Llama 3 / Mixtral LLM APIs.
- **🔐 Authentication & Security**: JWT-based user session authentication with `bcryptjs` password hashing and secure Express middleware.
- **📊 Health & Telemetry Dashboard**: Real-time health monitoring of PostgreSQL, Vector DB, LLM API, and local Embedding pipeline.
- **🎨 Glassmorphism React 19 UI**: Modern dark-themed dashboard featuring responsive layouts, live message indicators, drag-and-drop file upload, and typing animations.

---

## 🏗️ Architecture & System Flow

```mermaid
flowchart TD
    subgraph Frontend ["Frontend (React 19 + Vite)"]
        UI["User Interface / Chat Dashboard"]
        DocUpload["Document Upload Component"]
    end

    subgraph Backend ["Backend API (Node.js + Express + TS)"]
        AuthMiddleware["JWT Auth Middleware"]
        DocController["Document Controller"]
        ChatController["Chat Controller"]
        
        subgraph Pipeline ["RAG Pipeline"]
            Parser["PDF Parser (pdf-parse)"]
            Chunker["Semantic Chunker (tiktoken)"]
            LocalEmbedder["Transformers.js (all-MiniLM-L6-v2)"]
            VectorStore["Vector DB (ChromaDB / Cosine Fallback)"]
            Retrieval["Context Retriever"]
            PromptEng["Prompt Engine"]
        end
    end

    subgraph External ["Storage & Cloud AI"]
        Postgres[(PostgreSQL Cloud / Neon)]
        GroqAPI["Groq Cloud LLM API (Llama 3)"]
    end

    DocUpload -->|Multipart PDF/TXT| AuthMiddleware
    UI -->|Query Message| AuthMiddleware
    
    AuthMiddleware --> DocController
    AuthMiddleware --> ChatController

    DocController --> Parser --> Chunker --> LocalEmbedder --> VectorStore
    DocController -->|Metadata & Record| Postgres

    ChatController --> LocalEmbedder
    LocalEmbedder -->|Query Vector| VectorStore
    VectorStore -->|Top K Chunks| Retrieval
    Retrieval --> PromptEng
    PromptEng -->|Prompt + Context| GroqAPI
    GroqAPI -->|AI Response| UI
```

---

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js v20+ with TypeScript (`tsx`, `nodemon`)
- **Framework**: Express.js v5
- **Database**: PostgreSQL (Neon Cloud / Local) with `pg` driver
- **Embeddings**: `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`)
- **Vector DB**: ChromaDB (`chromadb`) / Built-in Vector Fallback
- **LLM Engine**: Groq SDK (`groq-sdk`)
- **Tokenizer**: `tiktoken`
- **Security & Utilities**: `bcryptjs`, `jsonwebtoken`, `helmet`, `cors`, `multer`, `pdf-parse`

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 8
- **Routing**: React Router DOM v7
- **HTTP Client**: Axios
- **Styling**: Modern CSS with CSS Custom Properties, Glassmorphism, and responsive flexbox/grid layouts

---

## 📁 Repository Structure

```
React-RAG/
├── package.json               # Monorepo scripts (dev, build)
├── backend/                   # Node.js Express Backend
│   ├── src/
│   │   ├── config/            # Environment & server setup
│   │   ├── controllers/       # Auth, Document & Chat handlers
│   │   ├── db/                # PostgreSQL schema & connection
│   │   ├── middleware/        # JWT auth & upload handling
│   │   ├── prompts/           # System prompts for RAG
│   │   ├── routes/            # Express route endpoints
│   │   ├── services/          # Ingestion, Chunking, Embedding, VectorDB, LLM services
│   │   ├── utils/             # Helper utilities
│   │   ├── app.ts             # Express app setup
│   │   └── index.ts           # Server entry point
│   ├── .env.example           # Backend environment template
│   ├── package.json
│   └── tsconfig.json
└── frontend/                  # React 19 Frontend App
    ├── src/
    │   ├── assets/            # Static media and icons
    │   ├── components/        # ChatWindow, MessageList, Loader, ChatInput, ErrorBanner
    │   ├── contexts/          # Chat & Auth React Contexts
    │   ├── pages/             # Login, Dashboard, Chat pages
    │   ├── services/          # Axios API client services
    │   ├── types/             # TypeScript definitions
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── index.css          # Core CSS design system
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

---

## ⚙️ Prerequisites

Before running the project, ensure you have installed:
- **Node.js**: `v18.0.0` or higher (v20 recommended)
- **npm**: `v9.0.0` or higher
- **Groq API Key**: Obtain a free API key from [Groq Console](https://console.groq.com/)
- **PostgreSQL**: A cloud PostgreSQL connection URL (e.g., [Neon Cloud](https://neon.tech/)) or a local instance

---

## 🔑 Environment Configuration

Create a `.env` file inside the `backend/` folder based on `.env.example`:

```ini
# Groq API Key (Required for RAG response generation)
GROQ_API_KEY=gsk_your_groq_api_key_here

# PostgreSQL Database Connection
DATABASE_URL=postgresql://username:password@localhost:5432/ragdb

# Authentication
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d

# Server Settings
PORT=5000
NODE_ENV=development

# Vector DB Settings
CHROMA_URL=http://localhost:8000

# File Upload Settings
MAX_FILE_SIZE_MB=10
UPLOAD_DIR=./uploads
```

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/React-RAG.git
cd React-RAG
```

### 2. Install Dependencies

Install dependencies for both backend and frontend:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 3. Start Development Servers

You can start backend and frontend concurrently using monorepo scripts from the root directory:

#### Run Backend:
```bash
npm run dev:backend
```
*Backend API will run on `http://localhost:5000`*

#### Run Frontend (in a separate terminal):
```bash
npm run dev:frontend
```
*Frontend app will run on `http://localhost:5173`*

---

## 📡 API Documentation

### 🔓 Public Routes

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server, DB, Vector Store & LLM pipeline health status |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login user & return JWT token |

### 🔐 Protected Routes *(Requires `Authorization: Bearer <token>`)*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/documents/upload` | Upload PDF/TXT file, chunk & store vectors |
| `GET` | `/api/documents` | List uploaded user documents |
| `DELETE` | `/api/documents/:id` | Delete a document and its embeddings |
| `POST` | `/api/chat/message` | Send prompt message & receive RAG response |
| `GET` | `/api/chat/history` | Retrieve conversation history |

---

## 🎨 Frontend Overview

The React 19 frontend provides an intuitive workflow:
1. **Authentication**: Quick Login & Signup views with secure JWT storage.
2. **Document Management**: Drag-and-drop document uploader with progress feedback and file list management.
3. **Interactive Chat**: Real-time response streaming, animated typing indicators, and markdown formatting.
4. **Health Indicator**: Dynamic service status badge connected to the `/health` endpoint.

---

## 🛠️ Troubleshooting

### 1. `EADDRINUSE: address already in use :::5000`
This error means port 5000 is occupied by an existing backend process.
- **Windows**:
  ```powershell
  cmd.exe /c "taskkill /F /PID <process_id>"
  ```
- **Linux / Mac**:
  ```bash
  kill -9 $(lsof -t -i:5000)
  ```

### 2. `Xenova/all-MiniLM-L6-v2` First Download Delay
On the first document upload or embedding call, `@xenova/transformers` downloads the ONNX model files (~90MB) locally. Subsequent embedding generations run instantly offline.

### 3. Groq API Limits / Missing Key
Ensure `GROQ_API_KEY` is set correctly in `backend/.env`. Check `/health` endpoint response to confirm LLM pipeline status.

---

## 📜 License

This project is open-source under the [ISC License](LICENSE).

---

<p align="center">
  Crafted with ❤️ for building high-performance, cost-effective RAG systems.
</p>
