import { validateAgentFormInputs } from "./inputValidation";
import { getServiceFormInputsForAgent, getServiceFormInputsForService } from "./formSchemas";

/** Validate by agent id (API routes). */
export function validateRunInputs(agentId, rawInputs) {
  return validateAgentFormInputs(getServiceFormInputsForAgent(agentId), rawInputs);
}

/** Validate by service page id (client Try-it panel — avoids stale detail.agent.id). */
export function validateRunInputsForService(serviceId, rawInputs) {
  return validateAgentFormInputs(getServiceFormInputsForService(serviceId), rawInputs);
}

export function isRunInputValid(agentId, rawInputs) {
  return !validateRunInputs(agentId, rawInputs).error;
}

export function isRunInputValidForService(serviceId, rawInputs) {
  return !validateRunInputsForService(serviceId, rawInputs).error;
}

/** API route sanitization — validation always runs before payment checks. */
export function sanitizeRunInputs(agentId, inputs) {
  return validateRunInputs(agentId, inputs);
}
