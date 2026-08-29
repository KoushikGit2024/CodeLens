const { Router } = require('express');
const repositoryController = require('../controllers/repositoryController');
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

// POST /api/repository/:id/ask             — AI Q&A for repository
router.post('/:id/ask', ask);

module.exports = router;
