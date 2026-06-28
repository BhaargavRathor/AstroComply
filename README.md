# 🛰️ AstroComply AI: Autonomous Space Mission Licensing & Regulatory Approval

AstroComply AI is an enterprise-grade process orchestration platform designed for the **UiPath AgentHack** competition. It automates space mission licensing and satellite regulatory compliance audits by coordinating AI agents, RPA bots, Document Understanding, and human review under a unified execution plane.

By combining **FastAPI**, **LangGraph** (multi-agent graph reasoning), **Qdrant** (semantic RAG space regulations), and **Next.js** (3D orbital tracking visualizer), AstroComply AI implements a robust process that enforces space debris mitigation treaties (ESA/IADC) for pre-launch authorizations.

---

## 🏗️ Solution Architecture & Orchestration Flow

AstroComply AI models a hybrid process flow aligned with **Track 2: UiPath Maestro BPMN**:

```text
  Proposal PDF
       │
       ▼
[1. Document Understanding] ──(Extract parameters)──► [2. SAP Billing Verification]
                                                             │
                                                        (Paid status?)
                                                             │
                                                ┌────────────┴────────────┐
                                                ▼ (No)                    ▼ (Yes)
                                          [Billing Block]         [3. LangGraph Safety Audit]
                                                                          │
                                                                   (Risk threshold /
                                                                   Violations check)
                                                                          │
                                                ┌────────────┴────────────┐
                                                ▼ (Risk / Violation)      ▼ (Compliant)
                                       [4. Action Center Task]            │
                                                │                         │
                                         (Approve / SLA Timeout)          │
                                                │                         │
                                                ├─────────────────────────┘
                                                ▼
                                    [5. RPA Asset Registration]
                                                │
                                                ▼
                                    [6. Licensing Approved]
```

1. **UiPath Document Understanding**: Ingests launch proposal PDF documents, automatically extracting operator info, target altitude, inclination, eccentricity, and debris metrics.
2. **SAP License Fee Check**: Verifies if the operator's account has outstanding licensing balances. Delinquent accounts trigger a billing block.
3. **LangGraph Multi-Agent Safety Audit**: FastAPI executes a LangGraph network of 8 specialized agents (Orbital, Collision, Compliance, Sustainability, Forecast, Mitigation, Documentation) querying ESA/IADC regulatory clauses semantically via Qdrant.
4. **UiPath Action Center & SLA Failsafe**: Launches a human inspector review form if risk > threshold or regulations are violated. A 15-minute SLA countdown is configured; if the SLA is breached, the system auto-escalates to trigger autonomous thruster avoidance burn commands.
5. **UiPath RPA Asset Registration**: RPA bots automatically register approved satellites in the international space assets registry.

---

## 🛠️ Technology Stack

* **Orchestration / Low-Code Layer**: UiPath Automation Cloud (Maestro BPMN, Action Center, Document Understanding, API Workflows, RPA Bots).
* **Multi-Agent Reasoning**: LangGraph, LangChain, Groq (Llama 3.3 70B).
* **Semantic Vector Search (RAG)**: Qdrant Database.
* **Metadata & Logs Store**: PostgreSQL Database.
* **Backend API Gateway**: FastAPI (Python).
* **Interactive Control Deck**: Next.js (TypeScript, TailwindCSS, Framer Motion, Globe.gl 3D visualization, Recharts).

---

## 💻 Setup & Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm

### 1. Clone the Repository
```bash
git clone https://github.com/BhaargavRathor/AstroComply.git
cd AstroComply
```

### 2. Configure Environment Variables
Create a `.env` file in the root folder:
```env
GROQ_API_KEY=your_groq_api_key_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mosip
DB_USER=postgres
DB_PASSWORD=
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

Create a `frontend/.env.local` file:
```env
NEXT_PUBLIC_MOSIP_API_BASE=http://localhost:8000
```

### 3. Spin up Backend
Install dependencies and run the FastAPI server:
```bash
pip install -r requirements.txt
python -m uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000
```
*Note: If PostgreSQL is offline, the API includes graceful fallback layers to serve high-fidelity mock datasets, ensuring zero-crash client evaluation.*

### 4. Spin up Frontend
Install package dependencies and run Next.js:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚀 Running the Orchestration Simulator

### UI Dashboard Simulation
1. Navigate to [http://localhost:3000/simulator](http://localhost:3000/simulator).
2. Click the **UiPath Orchestration** tab.
3. Select a simulated PDF proposal payload (**Low Risk**, **High Risk**, or **Delinquent Billing**).
4. Click **Start Orchestration** to visualize the live stepper status, terminal logs, Action Center task triggers, live SLA countdown, and RPA registration.

### Command-Line Integration Runner
A python CLI runner is included to test the API integrations headlessly. You can pass arguments to simulate different process lifecycles:
```bash
# Scenario 1: Compliant Launch (Auto-Approves & Registers)
python uipath_workflow_sim.py 1

# Scenario 2: High Risk (Held in Action Center, manual Approval)
python uipath_workflow_sim.py 2 A

# Scenario 2: High Risk (SLA breach / Timeout, auto-escalates avoidance burns)
python uipath_workflow_sim.py 2 W

# Scenario 3: Unpaid Operator (Fails SAP check)
python uipath_workflow_sim.py 3
```

---

## 🤖 Coding Agent Built: Bonus Points
AstroComply AI was built and integrated with the help of **Antigravity (a Gemini 3.5 Flash powered autonomous coding agent)** under the **UiPath for Coding Agents** workflow. The agent was used to construct endpoints, manage background tasks, formulate mock billing fallbacks, and rebrand Next.js dashboard UI views. 

Details of this coding agent cooperation are featured in our devpost submission video!

---

## 📄 License
Licensed under the Apache License, Version 2.0.
