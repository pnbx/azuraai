"use strict";

/**
 * Phase 5 Provider and Model Catalog Module Index
 *
 * Exports the public interface for the provider abstraction layer and model catalog.
 * This module should be imported from server-side code only.
 */

export * from "./types";
export * from "./registry";
export * from "./avaliProvider";
export * from "./init";
export * from "./model-catalog";

// Re-export the main initialization function and model catalog functions
export { initializeProviders } from "./init";
export {
  getModelBySlug,
  listEnabledModels,
  resolveModel,
  modelSupportsOperation,
  getModelsByProvider,
  healthCheck,
} from "./model-catalog";