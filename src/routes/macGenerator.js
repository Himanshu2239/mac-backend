// routes/macGenerator.js
import express from "express";
import {
  registerMacGenerator,
  generateParameters,
  getGenerationResultsForONT,
  getGenerationResultsForSwitch,
  getGenerationResults,
  searchMacGenerators,
  validateParametersToGenerate
} from "../controllers/macGenerator.js";

const router = express.Router();

// POST   /mac-generator/register
router.post("/new-work-order", registerMacGenerator);

// PATCH  /mac-generator/:id/generate
router.patch("/:id/generate", generateParameters);

//GET     /mac-generator/:id/results
router.get("/:id/ont-results", getGenerationResultsForONT);

//GET     /mac-generator/:id/switch-results
router.get("/:id/switch-results", getGenerationResultsForSwitch);

router.get("/:id/results", getGenerationResults);

// GET /api/mac-generator/search
// Query params: workOrderNumber, customerName, itemType, startMacId, date (latest|oldest), page, limit
router.post("/search", searchMacGenerators);

// GET /api/mac-generator/:id/validate
router.get("/:id/validate", validateParametersToGenerate);

export default router;
