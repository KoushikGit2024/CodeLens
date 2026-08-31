const { Router } = require('express');
const repositoryController = require('./repository.controller');
const documentationController = require('../assistant/documentation.controller');
const assistantController = require('../assistant/assistant.controller');
const ciController = require('../engineering/ci.controller');
const engineeringHealthController = require('../engineering/engineering.controller');
const refactoringController = require('../engineering/refactoring.controller');
const repositoryIntelligenceController = require('./intelligence.controller');
const { uploadMiddleware } = require('../../core/middleware/upload');

const router = Router();

// POST /api/repository/upload              — upload a ZIP archive
router.post('/upload', uploadMiddleware, repositoryController.upload);

// GET  /api/repository/list/all            — list all repositories
router.get('/list/all', repositoryController.listRepositories);

// GET  /api/repository/:id                 — repository record + status
router.get('/:id', repositoryController.getRepository);

// GET  /api/repository/:id/files           — file tree
router.get('/:id/files', repositoryController.listFiles);

// GET  /api/repository/:id/file?path=…     — raw file content
router.get('/:id/file', repositoryController.getFile);



// GET  /api/repository/:id/graph           — full dependency graph
router.get('/:id/graph', repositoryController.getDependencyGraph);

// GET  /api/repository/:id/graph/file?path=…  — deps/dependents for one file
router.get('/:id/graph/file', repositoryController.getFileDependencyInfo);

// GET  /api/repository/:id/architecture    — architecture model + mermaid + ai insights
router.get('/:id/architecture', repositoryController.getArchitecture);

// GET  /api/repository/:id/documentation/overview — AI docs (Overview + Architecture)
router.get('/:id/documentation/overview', documentationController.getOverviewDocumentation);

// GET  /api/repository/:id/documentation/file?path=... — AI docs (Module)
router.get('/:id/documentation/file', documentationController.getModuleDocumentation);


// POST /api/repository/:id/question        — AI Repository Intelligence Q&A
router.post('/:id/question', assistantController.askQuestion);

// PUT /api/repository/:id/chat/:chatId     — Persist chat history
router.put('/:id/chat/:chatId', assistantController.saveChatHistory);

// GET /api/repository/:id/risks            — Deterministic engineering risks
router.get('/:id/risks', engineeringHealthController.getRisks);

// GET /api/repository/:id/risks/insights   — AI insights on risks
router.get('/:id/risks/insights', engineeringHealthController.getAiInsights);

// POST /api/repository/:id/analyze         — Incremental/Full Analysis (CI)
router.post('/:id/analyze', ciController.analyze);

// GET /api/repository/:id/impact           — Change Impact Analysis (CI)
router.get('/:id/impact', ciController.getImpact);

// GET /api/repository/:id/ci-report        — Machine-readable CI Report
router.get('/:id/ci-report', ciController.getCiReport);

// --- Refactoring Intelligence (Step 13) ---
router.get('/:id/refactoring', refactoringController.getRefactoring);
router.get('/:id/refactoring/:candidateId', refactoringController.getCandidate);
router.get('/:id/refactoring/:candidateId/impact', refactoringController.getCandidateImpact);
router.get('/:id/refactoring/:candidateId/insights', refactoringController.getCandidateInsights);
router.post('/:id/refactoring/:candidateId/auto-fix', refactoringController.autoFixCandidate);

// --- Unified Repository Intelligence (Step 14) ---
router.get('/:id/intelligence', repositoryIntelligenceController.getIntelligence);

module.exports = router;
