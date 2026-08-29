const { Router } = require('express');
const repositoryController = require('../controllers/repositoryController');
const documentationController = require('../controllers/documentationController');
const assistantController = require('../controllers/assistantController');
const ciController = require('../controllers/ciController');
const { uploadMiddleware } = require('../middleware/upload');
const { ask } = require('../ai/askController');

const router = Router();

// POST /api/repository/upload              — upload a ZIP archive
router.post('/upload', uploadMiddleware, repositoryController.upload);

// GET  /api/repository/:id                 — repository record + status
router.get('/:id', repositoryController.getRepository);

// GET  /api/repository/:id/files           — file tree
router.get('/:id/files', repositoryController.listFiles);

// GET  /api/repository/:id/file?path=…     — raw file content
router.get('/:id/file', repositoryController.getFile);

// GET  /api/repository/:id/analysis        — full repository analysis (symbols for all files)
router.get('/:id/analysis', repositoryController.getAnalysis);

// GET  /api/repository/:id/analysis/file?path=…  — analysis for a single file
router.get('/:id/analysis/file', repositoryController.getFileAnalysis);

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

// POST /api/repository/:id/ask             — (Legacy) AI Q&A for repository
router.post('/:id/ask', ask);

// POST /api/repository/:id/question        — AI Repository Intelligence Q&A
router.post('/:id/question', assistantController.askQuestion);

// POST /api/repository/:id/analyze         — Incremental/Full Analysis (CI)
router.post('/:id/analyze', ciController.analyze);

// GET /api/repository/:id/impact           — Change Impact Analysis (CI)
router.get('/:id/impact', ciController.getImpact);

// GET /api/repository/:id/ci-report        — Machine-readable CI Report
router.get('/:id/ci-report', ciController.getCiReport);

module.exports = router;
