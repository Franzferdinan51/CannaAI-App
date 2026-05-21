# CannaAI Web Version

An AI-powered cannabis growing assistant built with Vite + React + TypeScript. CannaAI helps growers diagnose plant health issues, get expert advice, and manage their grow with multiple AI providers and an intelligent council system.

## Features

- **Dashboard** — Overview of your grow operation and analysis reports
- **Plant Analysis** — Upload plant images for AI-powered health diagnosis with detailed scoring, detected issues, and treatment recommendations
- **AI Chat** — Conversational interface for growing questions and advice
- **Plant Doctor Agent** — Autonomous agent that plans, researches, and diagnoses plant issues using web search and tool use
- **AI Council** — Multi-persona deliberation system where AI experts debate and reach consensus on growing topics (deliberation, advisory, consensus, adversarial, brainstorm, and more modes)
- **Strain Library** — Browse and search cannabis strains with detailed info on effects, growing difficulty, flowering time, and medical uses
- **Settings** — Configure AI providers (LM Studio, OpenRouter, NVIDIA NIM, OpenAI-compatible endpoints) with separate text and vision model selection

## Tech Stack

- **Frontend:** React 19, TypeScript 5.6, Vite 6
- **Styling:** Custom CSS
- **AI Integration:** Multi-provider support with vision model capabilities
- **Markdown:** react-markdown with remark-gfm

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- An AI provider (e.g., LM Studio for local inference, or an OpenRouter/OpenAI API key)

### Installation

```bash
# Clone the repository
git clone https://github.com/Franzferdinan51/CannaAI-Web-Version.git
cd CannaAI-Web-Version

# Install dependencies
bun install
# or
npm install

# Start the dev server
bun dev
# or
npm run dev
```

### Configuration

1. Open the app and go to **Settings**
2. Add an AI provider (LM Studio, OpenRouter, NVIDIA NIM, or any OpenAI-compatible endpoint)
3. Configure your text and vision models
4. Start using the Plant Analysis, Chat, or Agent features

## Project Structure

```
src/
  App.tsx              # Root component with page routing
  main.tsx             # React entry point
  types.ts             # TypeScript type definitions
  constants.ts         # App constants
  index.css            # Global styles
  components/
    Dashboard.tsx       # Main dashboard view
    PlantAnalysis.tsx   # Plant health analysis with image upload
    Chat.tsx            # AI chat interface
    AgentChat.tsx       # Autonomous plant doctor agent
    CouncilChamber.tsx  # Multi-AI deliberation system
    StrainLibrary.tsx   # Cannabis strain browser
    SettingsPanel.tsx   # Provider configuration
    Sidebar.tsx         # Navigation sidebar
    AnalysisReport.tsx  # Analysis report viewer
    MarkdownContent.tsx # Markdown renderer
  services/
    ai-providers.ts     # AI provider management
    agent.ts            # Agent framework
    agent-tools.ts      # Agent tool definitions
    analysis.ts         # Plant analysis logic
    council.ts          # AI council deliberation
    strains.ts          # Strain data and search
    team-orchestrator.ts # Multi-model orchestration
    web-search.ts       # Web search integration
  utils/
    storage.ts          # LocalStorage helpers
```

## Build

```bash
npm run build
# or
bun run build
```

The built files will be in the `dist/` directory.

## License

MIT
